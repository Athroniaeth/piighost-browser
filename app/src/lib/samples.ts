/**
 * Textes d'exemple, choisis pour montrer le partage des rôles.
 *
 * Chacun mêle du PII de forme fixe, que les règles attrapent seules, et du PII
 * non structuré que seul le modèle voit. Les accents et les noms composés sont
 * volontaires : c'est là que les portages JS de GLiNER se trompent.
 */

export type Sample = {
  name: string;
  title: { en: string; fr: string };
  text: string;
};

export const SAMPLES: Sample[] = [
  {
    name: "support",
    title: { en: "Support ticket", fr: "Ticket de support" },
    text:
      "Bonjour, je suis Jean Dupont, j'habite 12 rue de la Paix à Lyon. " +
      "Joignable au 06 12 34 56 78 ou jean.dupont@example.com. " +
      "Mon IBAN est FR7630006000011234567890189. " +
      "Jean-Luc Mélenchon de chez Acme Corporation a déjà traité mon dossier.",
  },
  {
    name: "contrat",
    title: { en: "Contract extract", fr: "Extrait de contrat" },
    text:
      "L'entreprise Œuvres Réunies SA, sise 3 place de l'Étoile, 75008 Paris, " +
      "représentée par Mme Anne-Sophie Lefèvre-Durand, joignable au " +
      "+33 1 42 68 53 00 et à contact@oeuvres-reunies.fr, confie la mission " +
      "à M. Müller, domicilié à Strasbourg.",
  },
  {
    name: "medical",
    title: { en: "Clinical note", fr: "Note clinique" },
    text:
      "Dr. Smith saw patient John Doe on 2024-03-15 at Mercy Hospital, London. " +
      "Follow-up scheduled with Dr. Zoé Béranger at the Hôpital Saint-Antoine. " +
      "Contact the family at +44 20 7946 0958 or doe.family@example.co.uk.",
  },
  {
    name: "logs",
    title: { en: "Application log", fr: "Journal applicatif" },
    text:
      "2026-09-18T09:14:22Z WARN auth: failed login for marie.curie@labo.fr " +
      "from 192.168.1.42, card ending 4111 1111 1111 1111, session held by " +
      "Marie Curie at the Institut Radium.",
  },
  {
    name: "long",
    title: { en: "Long text, forces chunking", fr: "Texte long, force le découpage" },
    text:
      "Compte rendu de reunion. " +
      "Jean Dupont habite a Lyon, joignable au 06 12 34 56 78. ".repeat(30) +
      "La derniere cliente est Marie Curie, a Paris, marie.curie@labo.fr.",
  },
  {
    name: "libre",
    title: { en: "Empty, write your own", fr: "Vide, écrivez le vôtre" },
    text: "",
  },
];
