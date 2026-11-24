"use client";

import { useEffect, useRef } from "react";
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Pilcrow, Table2 } from "lucide-react";

type Props = {
  initialHtml: string;
  onInput: (html: string) => void;
  onPickImage: () => void;
  /** diisi induk agar bisa menyisipkan gambar setelah upload selesai */
  registerInsertImage: (fn: (url: string) => void) => void;
  registerGetHtml: (fn: () => string) => void;
};

function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

export function RichEditor({ initialHtml, onInput, onPickImage, registerInsertImage, registerGetHtml }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml;
    registerGetHtml(() => ref.current?.innerHTML ?? "");
    registerInsertImage((url) => {
      ref.current?.focus();
      exec("insertImage", url);
      onInput(ref.current?.innerHTML ?? "");
    });
    // hanya saat pertama kali editor tampil
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addLink() {
    const url = window.prompt("Alamat tautan (https://…):");
    if (!url) return;
    if (!/^https?:\/\//i.test(url.trim())) {
      window.alert("Tautan harus diawali http:// atau https://");
      return;
    }
    exec("createLink", url.trim());
    onInput(ref.current?.innerHTML ?? "");
  }

  function addTable() {
    const rowsRaw = window.prompt("Jumlah baris (termasuk header):", "3");
    const colsRaw = window.prompt("Jumlah kolom:", "3");
    const rows = Math.min(20, Math.max(1, parseInt(rowsRaw ?? "", 10) || 0));
    const cols = Math.min(8, Math.max(1, parseInt(colsRaw ?? "", 10) || 0));
    if (!rows || !cols) return;
    const head = `<tr>${Array.from({ length: cols }, (_, i) => `<th>Kolom ${i + 1}</th>`).join("")}</tr>`;
    const body = Array.from({ length: rows - 1 }, () => `<tr>${Array.from({ length: cols }, () => "<td><br></td>").join("")}</tr>`).join("");
    ref.current?.focus();
    exec("insertHTML", `<table><thead>${head}</thead><tbody>${body}</tbody></table><p><br></p>`);
    onInput(ref.current?.innerHTML ?? "");
  }

  const btn = "rounded-lg p-2 text-muted transition hover:bg-surface2/60 hover:text-ink";
  // onMouseDown + preventDefault menjaga seleksi teks tetap aktif saat tombol ditekan
  const tool = (label: string, icon: React.ReactNode, action: () => void) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      className={btn}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        action();
        onInput(ref.current?.innerHTML ?? "");
      }}
    >
      {icon}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-line/20 bg-bg/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line/15 bg-surface/60 p-1.5" role="toolbar" aria-label="Format teks">
        {tool("Heading 2", <Heading2 className="h-4 w-4" />, () => exec("formatBlock", "<h2>"))}
        {tool("Heading 3", <Heading3 className="h-4 w-4" />, () => exec("formatBlock", "<h3>"))}
        {tool("Paragraf", <Pilcrow className="h-4 w-4" />, () => exec("formatBlock", "<p>"))}
        <span className="mx-1 h-5 w-px bg-line/20" />
        {tool("Tebal", <Bold className="h-4 w-4" />, () => exec("bold"))}
        {tool("Miring", <Italic className="h-4 w-4" />, () => exec("italic"))}
        <span className="mx-1 h-5 w-px bg-line/20" />
        {tool("Daftar bullet", <List className="h-4 w-4" />, () => exec("insertUnorderedList"))}
        {tool("Daftar nomor", <ListOrdered className="h-4 w-4" />, () => exec("insertOrderedList"))}
        <span className="mx-1 h-5 w-px bg-line/20" />
        <button type="button" aria-label="Tautan" title="Tautan" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={addLink}>
          <Link2 className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Sisipkan gambar" title="Sisipkan gambar" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={onPickImage}>
          <ImagePlus className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Sisipkan tabel" title="Sisipkan tabel" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={addTable}>
          <Table2 className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={ref}
        className="lesson-editor lesson-content min-h-64 p-4"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Isi materi"
        data-placeholder="Tulis materi di sini…"
        onInput={() => onInput(ref.current?.innerHTML ?? "")}
        onPaste={(e) => {
          // Tempel sebagai teks biasa agar tidak membawa gaya/skrip dari web.
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
      />
    </div>
  );
}
