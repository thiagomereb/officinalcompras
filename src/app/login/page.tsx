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
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col justify-between border-b border-linha px-6 py-8 lg:border-b-0 lg:border-r lg:px-14 lg:py-12">
        <Marca grande />
        <div className="mt-10 max-w-xl lg:mt-0">
          <p className="titulo text-[28px] leading-[1.15] lg:text-[40px]">
            Cotações de insumos, comparadas por grama.
          </p>
          <p className="mt-4 max-w-md text-[15px] text-ardosia">
            Lance as tabelas dos fornecedores, vincule cada item ao insumo certo e aprove o mapa com a
            melhor oferta.
          </p>
        </div>
        <p className="mt-10 hidden text-[12px] text-ardosia-2 lg:block">Uso interno da farmácia.</p>
      </section>

      <section className="flex items-center justify-center bg-papel px-6 py-12">
        <form action={login} className="w-full max-w-[340px] space-y-5">
          <div>
            <h1 className="titulo text-[22px]">Entrar</h1>
            <p className="mt-1 text-[13.5px] text-ardosia">Use o e-mail e a senha da sua conta.</p>
          </div>

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
      </section>
    </div>
  )
}
