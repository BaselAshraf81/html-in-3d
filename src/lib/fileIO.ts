/**
 * File I/O using the File System Access API (Chrome/Edge).
 * Falls back to Tauri native APIs when running in the desktop shell.
 * Falls back to blob download for browsers without File System Access API.
 */

export function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__;
}

/**
 * Save a text file via native file picker dialog.
 */
export async function saveTextFile(
  content: string,
  defaultName: string,
  filters?: { name: string; extensions: string[] }[]
): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const filePath = await save({
      title: "Save File",
      defaultPath: defaultName,
      filters,
    });
    if (!filePath) return null;
    await writeTextFile(filePath, content);
    return filePath;
  }

  // File System Access API (Chrome/Edge)
  if (typeof (window as any).showSaveFilePicker === "function") {
    try {
      const opts: any = { suggestedName: defaultName };
      if (filters?.length) {
        opts.types = filters.map((f) => ({
          description: f.name,
          accept: { "application/octet-stream": f.extensions.map((e) => `.${e}`) },
        }));
      }
      const handle = await (window as any).showSaveFilePicker(opts);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return handle.name;
    } catch (e: any) {
      if (e.name === "AbortError") return null;
      throw e;
    }
  }

  // Fallback: blob download for Firefox/Safari/unsupported browsers
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return defaultName;
}

/**
 * Open and read a text file via native file picker dialog.
 */
export async function openTextFile(
  filters?: { name: string; extensions: string[] }[]
): Promise<{ content: string; name: string } | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const filePath = await open({
      title: "Open File",
      multiple: false,
      filters,
    });
    if (!filePath) return null;
    const content = await readTextFile(filePath as string);
    return { content, name: filePath as string };
  }

  // File System Access API (Chrome/Edge)
  if (typeof (window as any).showOpenFilePicker === "function") {
    try {
      const opts: any = {};
      if (filters?.length) {
        opts.types = filters.map((f) => ({
          description: f.name,
          accept: { "application/octet-stream": f.extensions.map((e) => `.${e}`) },
        }));
      }
      const [handle] = await (window as any).showOpenFilePicker(opts);
      const file = await handle.getFile();
      const content = await file.text();
      return { content, name: file.name };
    } catch (e: any) {
      if (e.name === "AbortError") return null;
      throw e;
    }
  }

  // Fallback: hidden file input for Firefox/Safari/unsupported browsers
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (filters?.length) {
      input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(",");
    }
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const content = await file.text();
      resolve({ content, name: file.name });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
