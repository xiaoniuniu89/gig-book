"use client";
import { useEffect } from "react";
import { Oops } from "@/components/Oops";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <Oops code={500} lines={["Something broke on our side.", "Try again, or report it with Bugs & ideas."]}>
      <button className="btn" onClick={reset}>Try again</button>
    </Oops>
  );
}
