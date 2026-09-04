export async function parseError(res: Response): Promise<string> {
  let message = 'Something went wrong.'
  try {
    const body = await res.json()
    if (body?.error && typeof body.error === 'string') message = body.error
  } catch {
    // fall back to generic message when the body is not JSON
  }
  return message
}