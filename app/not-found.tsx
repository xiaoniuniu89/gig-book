import { Oops } from "@/components/Oops";

export default function NotFound() {
  return <Oops code={404} lines={["What you're looking for doesn't exist.", "Here are some places to start…"]}
    links={[{ href: "/", label: "Home" }, { href: "/setlists", label: "Setlists" }, { href: "/library", label: "Library" }]} />;
}
