import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";

/**
 * Assina tokens para o navegador enviar arquivos direto ao Vercel Blob.
 *
 * Server Actions têm teto de 4,5 MB de body na Vercel, o que reprova
 * qualquer música de duração normal (o servidor respondia 413 e a página
 * quebrava). Aqui o arquivo nunca passa pelo servidor: ele só autoriza.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Só administradores alimentam o catálogo. Sem esta checagem, a
        // rota seria um upload aberto para qualquer visitante.
        const user = await currentUser();
        if (user?.role !== "admins") {
          throw new Error("Apenas administradores podem enviar arquivos.");
        }

        const isCover = pathname.startsWith("covers/");
        return {
          allowedContentTypes: isCover
            ? ["image/jpeg", "image/png", "image/webp", "image/avif"]
            : [
                "audio/mpeg",
                "audio/mp3",
                "audio/wav",
                "audio/x-wav",
                "audio/ogg",
                "audio/flac",
                "audio/x-flac",
                "audio/mp4",
                "audio/aac",
              ],
          maximumSizeInBytes: isCover ? 8 * 1024 * 1024 : 60 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      onUploadCompleted: async () => {
        // O registro no catálogo é feito pela Server Action que recebe a
        // URL depois do envio; aqui não há nada a fazer.
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha no upload." },
      { status: 400 },
    );
  }
}
