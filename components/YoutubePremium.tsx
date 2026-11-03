"use client";
// "Connect YouTube Premium": opens Google's YouTube sign-in in a new tab. Ads go away when the listener is signed in to YouTube in this browser;
// we can't pass Premium to the embedded player ourselves and can't tell whether it worked, so nothing here claims it's connected.
import { Icon } from "./Icon";
import { Info } from "./Info";

export const YOUTUBE_SIGN_IN = "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com";
export const PREMIUM_NOTE = "Have YouTube Premium? Sign in to YouTube in this browser for fewer or no ads. Doesn't work in every browser.";

export function ConnectPremium() {
  return (
    <span className="row-btns">
      <a className="btn" href={YOUTUBE_SIGN_IN} target="_blank" rel="noopener noreferrer"><Icon name="youtube" size={18} /> Connect YouTube Premium</a>
      <Info label="About YouTube Premium">{PREMIUM_NOTE}</Info>
    </span>
  );
}
