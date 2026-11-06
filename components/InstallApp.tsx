"use client";
// Account > Help: put Niu Real Book on your home screen or desktop, so it opens like an app.
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Info } from "./Info";
import { Modal } from "./Modal";
import { useApp } from "./AppProvider";
import { installState, onInstallChange, promptInstall, type InstallState } from "@/lib/install";

export function InstallApp() {
  const { toast } = useApp();
  const [state, setState] = useState<InstallState>("other");
  const [how, setHow] = useState(false);
  useEffect(() => { setState(installState()); return onInstallChange(() => setState(installState())); }, []);

  if (state === "installed") return <span className="cal-ok"><Icon name="import" size={16} /> Installed on this device</span>;
  const go = async () => {
    if (state === "prompt") { if (await promptInstall()) toast("Installed. Open it from your home screen or apps."); }
    else setHow(true);
  };
  return <>
    <button className="btn small" type="button" onClick={() => void go()}><Icon name="import" size={16} /> Install the app</button>
    <Info label="About installing">Puts Niu Real Book on your home screen or desktop, so it opens in its own window like an app, with no browser bars. It&apos;s the same site, always up to date.</Info>
    <Modal open={how} title="Install the app" onClose={() => setHow(false)}>
      {state === "ios" ? (
        <ol className="steps">
          <li>Open this site in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button (the square with an arrow).</li>
          <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        </ol>
      ) : (
        <ol className="steps">
          <li><b>Chrome or Edge:</b> click the install icon at the right of the address bar, or open the menu and choose <b>Install Niu Real Book</b> (or <b>Cast, save and share → Install page as app</b>).</li>
          <li><b>Safari on a Mac:</b> choose <b>File → Add to Dock</b>.</li>
          <li><b>Android:</b> open the browser menu and tap <b>Add to Home screen</b> or <b>Install app</b>.</li>
        </ol>
      )}
    </Modal>
  </>;
}
