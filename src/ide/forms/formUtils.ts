import captions from '../../generated/formCaptions.json';
import { lang } from '../../lang/lang';
import { FormCtl } from '../../vcl/FormCtl';
import { devData } from '../config';

/** Caption bindings extracted from the original Pascal LoadText methods. */
export function localize(c: FormCtl, name: string) {
  const map = (captions as Record<string, Record<string, number>>)[name] ?? {};
  for (const [key, id] of Object.entries(map)) {
    const [control, property] = key.split(':');
    if (!c.node(control)) continue;
    if (property === 'Caption') c.caption(control, lang(id));
    else c.set(control, { hint: lang(id) });
  }
  c.set(c.def.name, { fontName: devData.InterfaceFont, fontSize: devData.InterfaceFontSize });
}

export function bindChecks<T extends object>(c: FormCtl, values: T, map: Record<string, keyof T>) {
  for (const [control, key] of Object.entries(map)) c.checked(control, !!values[key]);
  return () => {
    for (const [control, key] of Object.entries(map)) values[key] = c.checked(control) as T[keyof T];
  };
}
