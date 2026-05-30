import type { LucideIcon } from "lucide-react";
import {
  GraduationCap,
  Leaf,
  Lightbulb,
  Shield,
  Users,
  UsersRound,
} from "lucide-react";

export const VISION_STATEMENT =
  "To be a leading student association that nurtures excellence in Animal Biology and Conservation Science, empowering students to advance research, conservation, and sustainable solutions for the benefit of society and the natural environment.";

export const MISSION_STATEMENT =
  "To promote academic excellence, research, and professional development among Animal Biology and Conservation Science students through knowledge sharing, collaboration with faculty, practical learning opportunities, and active engagement in conservation initiatives that benefit both the university community and society.";

export const CORE_VALUES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: GraduationCap,
    title: "Academic Excellence",
    description:
      "We strive for high academic standards and encourage continuous learning and research.",
  },
  {
    icon: Shield,
    title: "Integrity",
    description:
      "We promote honesty, accountability, and responsible leadership in all activities.",
  },
  {
    icon: Users,
    title: "Collaboration",
    description:
      "We strengthen relationships among students, lecturers, researchers, and conservation partners.",
  },
  {
    icon: Leaf,
    title: "Environmental Stewardship",
    description:
      "We are committed to protecting biodiversity and promoting sustainable conservation practices.",
  },
  {
    icon: Lightbulb,
    title: "Innovation",
    description: "We encourage creativity, critical thinking, and scientific inquiry.",
  },
  {
    icon: UsersRound,
    title: "Inclusiveness",
    description:
      "We value participation, diversity of ideas, and equal opportunities for all members.",
  },
];

/** Google Form — suggestions and feedback */
export const SUGGESTION_FORM_URL =
  "https://docs.google.com/forms/d/1TMZxUSXA8ZDvCvLwK8IpP33RjnDvFveG1B4Y6qK2UUs/viewform?usp=sf_link";

/**
 * Google Calendar embed: Calendar settings → Integrate calendar → customize & copy the iframe `src` URL.
 * Set `VITE_GOOGLE_CALENDAR_EMBED_URL` in `.env` (full URL, e.g. https://calendar.google.com/calendar/embed?src=...&ctz=Africa%2FAccra)
 */
export const GOOGLE_CALENDAR_EMBED_SRC =
  typeof import.meta.env.VITE_GOOGLE_CALENDAR_EMBED_URL === "string"
    ? import.meta.env.VITE_GOOGLE_CALENDAR_EMBED_URL.trim()
    : "";

/** UGLSU / event proposal form — override with VITE_EVENT_PROPOSAL_URL if you use a separate Google Form */
const proposalEnv =
  typeof import.meta.env.VITE_EVENT_PROPOSAL_URL === "string"
    ? import.meta.env.VITE_EVENT_PROPOSAL_URL.trim()
    : "";
export const EVENT_PROPOSAL_URL = proposalEnv || SUGGESTION_FORM_URL;

/**
 * Internships listing (JSON array). Defaults to `/internships.json` in `public/`.
 * Override with `VITE_INTERNSHIPS_JSON_URL` for any HTTPS URL (GitHub raw, Gist, Apps Script, CMS export).
 */
export const INTERNSHIPS_DATA_URL =
  typeof import.meta.env.VITE_INTERNSHIPS_JSON_URL === "string" &&
  import.meta.env.VITE_INTERNSHIPS_JSON_URL.trim()
    ? import.meta.env.VITE_INTERNSHIPS_JSON_URL.trim()
    : "/internships.json";

/** ABCOSSA slides bank (Telegram) */
export const RESOURCES_TELEGRAM_URL = "https://t.me/+D7wbEAFXE7I1ZDZk";

export const CONTACT = {
  phoneDisplay: "020 072 3004",
  phoneTel: "+233200723004",
  email: "abcossa22@gmail.com",
  postalAddress: "P.O. Box LG 67, Accra, Ghana",
  departmentName: "Department Of Animal Biology And Conservation Science",
  streetAddress: "J.K.M. Hodasi Rd, Accra, GH-GE328-3680, GH",
  mapsSearchUrl:
    "https://maps.google.com/maps/search/Department%20Of%20Animal%20Biology%20And%20Conservation%20Science/@5.6535563468933105,-0.18733802437782288,17z?hl=en",
} as const;

/** Embed-friendly maps query (no API key). */
export const MAPS_EMBED_SRC =
  "https://www.google.com/maps?q=Department+Of+Animal+Biology+And+Conservation+Science%2C+J.K.M.+Hodasi+Rd%2C+Accra%2C+Ghana&output=embed";

export const SOCIAL = {
  instagram: "https://www.instagram.com/abcossa.ug",
  tiktok: "https://www.tiktok.com/@abcossa_ug",
  twitter: "https://x.com/abcossa_ug",
  snapchat: "https://www.snapchat.com/@abcossa.ug",
  whatsapp: "https://www.whatsapp.com/channel/0029Vb60pAfG3R3dnklAA32V",
  linktree:
    "https://linktr.ee/abcossa.ug?utm_source=linktree_profile_share&ltsid=c895f7f7-7377-44ed-9c7a-5963619c9703",
} as const;
