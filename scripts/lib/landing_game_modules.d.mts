export const GAME_MODULES_ELEMENT_ID: string;
export function gameModuleFiles(
  bundle: Record<
    string,
    { type?: string; fileName?: string; imports?: string[]; facadeModuleId?: string | null }
  >,
  entryFileName?: string,
): string[];
export function injectGameModules(html: string, urls: string[]): string;
