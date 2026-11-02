import { Marca } from '@/components/ui/Marca'
import { BotaoEnviar } from '@/components/ui/BotaoEnviar'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[360px]">
        <div className="mb-6 flex justify-center">
          <Marca />
        </div>

        <form action={login} className="painel space-y-5 p-6">
          <h1 className="titulo text-[18px]">Entrar</h1>

          {error && (
            <p className="aviso aviso-erro" role="alert">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="email" className="legenda">
              E-mail
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className="campo" />
          </div>
          <div>
            <label htmlFor="password" className="legenda">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="campo"
            />
          </div>

          <BotaoEnviar pendente="Entrando…" className="btn btn-primario w-full">
            Entrar
          </BotaoEnviar>
        </form>
      </div>
    </div>
  )
}
