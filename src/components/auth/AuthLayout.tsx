import Link from "next/link";
import Image from "next/image";
import { Logo } from "../Brand";

/**
 * Moldura das telas de acesso: a arte ocupa todo o lado esquerdo e o
 * formulário fica à direita. No mobile a arte some e sobra o formulário.
 *
 * A imagem já traz marca, título e benefícios compostos nela, então nada
 * é sobreposto — só a região da logo vira um link para a home.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-void lg:p-6">
      <div className="grid min-h-dvh overflow-hidden bg-canvas lg:min-h-[calc(100dvh-3rem)] lg:grid-cols-2 lg:rounded-2xl">
        {/* ---------------- arte ---------------- */}
        <aside className="relative hidden bg-black lg:block">
          {/*
            A arte enviada já traz marca, título e benefícios compostos
            nela. `cover` preenche a coluna inteira; o enquadramento à
            esquerda mantém o texto visível e corta pela direita, onde
            só há céu e cidade.
          */}
          <Image
            src="/images/login-hero.jpg"
            alt="Sona — música sem fronteiras. As melhores músicas sempre com você: descubra artistas, viva novas histórias. Milhões de músicas, artistas incríveis, playlists para todo momento, em qualquer lugar."
            fill
            priority
            sizes="50vw"
            className="object-cover object-left"
          />
          {/* Região da logo dentro da arte, clicável. */}
          <Link
            href="/"
            aria-label="Sona — início"
            className="absolute left-[6%] top-[6%] h-[7%] w-[30%] rounded"
          />
        </aside>

        {/* ---------------- formulário ---------------- */}
        <main className="flex flex-col justify-center bg-sidebar px-6 py-12 sm:px-12 lg:px-14">
          <div className="mx-auto w-full max-w-[420px]">
            {/* No mobile, a marca aparece aqui no topo */}
            <div className="mb-10 lg:hidden">
              <Logo priority />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
