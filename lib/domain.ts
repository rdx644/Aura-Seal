import { parse } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';
import { SaxesParser } from 'saxes';
import { fromBuffer, type ZipFile } from 'yauzl';
import { resultInput, type ImportError, type Result } from './contracts';

export { eventInput } from './contracts';
export const uploadMax = 1024 * 1024;
const columns = ['participant_ref', 'display_name', 'tier', 'rank'];
const maxRows = 500;

export class InputError extends Error {}

function checkXml(xml: string) {
  const parser = new SaxesParser();
  let worksheet = false;
  parser.on('doctype', () => { throw new InputError('Unsupported workbook document type'); });
  parser.on('opentag', tag => {
    const name = tag.name.split(':').at(-1);
    if (name === 'worksheet') worksheet = true;
    if (name === 'Relationship' && tag.attributes.Type?.endsWith('/worksheet') &&
      !tag.attributes.Target?.toLowerCase().endsWith('.xml')) {
      throw new InputError('Worksheet reference must point to an XML part');
    }
    if (!worksheet) return;
    const ref = tag.attributes.r;
    if (name === 'row' && (!/^[1-9]\d{0,2}$/.test(ref ?? '') || Number(ref) > maxRows + 1)) {
      throw new InputError('Workbook exceeds 500 data rows');
    }
    if (name === 'c') {
      const cell = /^([A-Z]|A[A-F])([1-9]\d{0,2})$/.exec(ref ?? '');
      if (!cell || Number(cell[2]) > maxRows + 1) throw new InputError('Workbook cell exceeds the supported range');
    }
  });
  parser.write(xml).close();
}

async function checkWorkbook(buffer: Buffer) {
  await new Promise<void>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true }, (error, archive?: ZipFile) => {
      if (error || !archive) return reject(new InputError('Invalid XLSX workbook'));
      let expanded = 0;
      const seen = new Set<string>();
      const fail = (reason: unknown) => {
        archive.close();
        reject(reason instanceof InputError ? reason : new InputError('Invalid XLSX workbook'));
      };
      archive.on('error', fail);
      archive.on('end', resolve);
      archive.on('entry', entry => {
        if (archive.entryCount > 128 || (entry.generalPurposeBitFlag & 1) || seen.has(entry.fileName)) {
          return fail(new InputError('Workbook contains unsupported archive entries'));
        }
        seen.add(entry.fileName);
        if (entry.fileName.endsWith('/')) return archive.readEntry();
        archive.openReadStream(entry, (err, stream) => {
          if (err || !stream) return fail(err);
          void (async () => {
            const xml = /\.(xml|rels)$/i.test(entry.fileName);
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              expanded += chunk.length;
              if (expanded > 12 * uploadMax) throw new InputError('Workbook exceeds the expanded size limit');
              if (xml) chunks.push(chunk);
            }
            if (xml) checkXml(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
          })().then(() => archive.readEntry(), fail);
        });
      });
      archive.readEntry();
    });
  });
}

export async function importResults(name: string, file: Buffer): Promise<{ rows: Result[]; errors: ImportError[] }> {
  if (!file.length || file.length > uploadMax) throw new InputError('Upload a CSV or XLSX file up to 1 MB');
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  let sheet: unknown[][];
  try {
    if (extension === 'csv') {
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(file);
      sheet = parse(csv, { bom: true, relax_column_count: true, max_record_size: 8192, to: maxRows + 2 });
    } else if (extension === 'xlsx') {
      await checkWorkbook(file);
      sheet = await readSheet(file, 1);
    } else {
      throw new InputError('Use a CSV or XLSX file');
    }
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError('The file could not be read. Check the file format and CSV quoting.');
  }
  const [header = [], ...data] = sheet;
  const keys = header.map(cell => String(cell ?? '').trim().toLowerCase());
  if (keys.length !== columns.length || columns.some(key => !keys.includes(key))) {
    throw new InputError('Expected columns participant_ref, display_name, tier and rank');
  }
  if (!data.length || data.length > maxRows) throw new InputError('Include between 1 and 500 data rows');

  const refs = new Set<string>();
  const rows: Result[] = [];
  const errors: ImportError[] = [];
  data.forEach((cells, index) => {
    if (cells.every(cell => cell === null || cell === '')) return;
    const [participantRef, displayName, tier, rank] = columns.map(key => String(cells[keys.indexOf(key)] ?? '').trim());
    const result = resultInput.safeParse({
      participantRef, displayName, tier: tier.toLowerCase(),
      rank: rank === '' ? null : /^\d+$/.test(rank) ? Number(rank) : NaN,
    });
    const ref = participantRef.normalize('NFKC').toLowerCase();
    const row = index + 2;
    if (cells.length > keys.length) errors.push({ row, message: 'Too many columns' });
    else if (!result.success) errors.push({ row, message: result.error.issues.map(issue => [issue.path.join('.'), issue.message].filter(Boolean).join(' — ')).join('; ') });
    else if (refs.has(ref)) errors.push({ row, message: 'Duplicate participant reference' });
    else {
      refs.add(ref);
      rows.push(result.data);
    }
  });
  if (!rows.length && !errors.length) throw new InputError('The file contains no results');
  return { rows, errors };
}
