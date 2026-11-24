import { routeRequest } from '@/lib/http';

type Context = { params: Promise<{ route: string[] }> };

export async function GET(request: Request, context: Context) {
  return routeRequest(request, (await context.params).route);
}

export async function POST(request: Request, context: Context) {
  return routeRequest(request, (await context.params).route);
}
