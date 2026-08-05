export async function isPasswordPwned(password) {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-1', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    const prefix = hashHex.slice(0, 5)
    const suffix = hashHex.slice(5)

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`)
    if (!response.ok) return 0 // fail open — nunca bloqueia por falha da API externa

    const text = await response.text()
    const match = text.split('\n').find(line => line.startsWith(suffix))
    return match ? parseInt(match.split(':')[1], 10) : 0
  } catch {
    return 0 // fail open — qualquer erro de rede não deve travar o usuário
  }
}
