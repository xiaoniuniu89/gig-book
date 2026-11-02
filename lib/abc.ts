/** Fill in the headers a lick usually leaves out: 4/4, eighth-note unit, key of C. */
export function fullAbc(abc: string): string {
  const t = abc.trim();
  const head = (h: string, v: string) => (new RegExp("^" + h + ":", "m").test(t) ? "" : h + ":" + v + "\n");
  const k = /^K:/m.test(t) ? "" : "K:C\n";
  return "X:1\n" + head("M", "4/4") + head("L", "1/8") + k + t;
}
