import { Lock } from "lucide-react";

/**
 * Page 403 affichee quand un utilisateur SSO client (offre restreinte)
 * tente d'acceder a une section qui n'est pas incluse dans son offre.
 * Les admins n'arrivent jamais ici grace a isRestrictedSession.
 */
export function ForbiddenPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center justify-center p-12 text-center max-w-md">
        <div className="mb-4 text-gray-400">
          <Lock className="h-12 w-12" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          Acces non disponible dans votre offre
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          Cette section n&apos;est pas incluse dans votre formule actuelle.
          Contactez MessagingMe pour en savoir plus sur les options
          disponibles.
        </p>
      </div>
    </div>
  );
}
