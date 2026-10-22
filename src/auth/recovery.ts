type RecoveryAuthClient = {
  exchangeCodeForSession(code: string, options?: { flowId?: string }): Promise<{ error: { message: string } | null }>
}

export async function completeRecoveryFromUrl(client: RecoveryAuthClient, rawUrl: string): Promise<boolean> {
  const url = new URL(rawUrl)
  if (url.protocol !== 'com.aid.roadside:' || url.hostname !== 'auth' || url.pathname !== '/recovery') return false
  const code = url.searchParams.get('code')
  if (!code) throw new Error('Password recovery link is invalid or expired.')
  const flowId = url.searchParams.get('sb_flow_id')
  const { error } = await client.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
  if (error) throw new Error(error.message)
  return true
}
