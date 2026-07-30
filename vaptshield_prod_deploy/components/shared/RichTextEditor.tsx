"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import { common, createLowlight } from 'lowlight'
import DOMPurify from 'dompurify'
import {
    Bold,
    Italic,
    List,
    ListOrdered,
    Code,
    Heading1,
    Heading2,
    Link as LinkIcon,
    Quote,
    Undo,
    Redo,
    Type
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const lowlight = createLowlight(common)

// ─── Z+ SECURITY: Allowed URL protocols for links ───
const ALLOWED_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'ftp:', 'ftps:']

/**
 * Validate that a URL uses only allowed protocols to prevent
 * javascript:, data:, and other dangerous URL schemes.
 */
function isValidUrlProtocol(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)
  } catch {
    // Relative URLs (e.g., /path, #anchor) are safe
    if (url.startsWith('/') || url.startsWith('#') || url.startsWith('.')) {
      return true
    }
    return false
  }
}

/**
 * Sanitize TipTap HTML output to prevent XSS via pasted malicious content.
 * Uses DOMPurify with a strict allowlist that matches TipTap's output capabilities.
 */
function sanitizeEditorHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'blockquote',
      'pre', 'code',
      'strong', 'b', 'em', 'i', 'u', 's', 'del',
      'a',
      'span', 'div',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|ftps|mailto):|[#/.])/i,
  })
}

export interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = "200px" }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false, // handled by lowlight
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline underline-offset-4 font-medium',
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start typing security analysis...',
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      // ─── Z+ SECURITY: Sanitize HTML output before passing to parent ───
      const rawHtml = editor.getHTML()
      const sanitizedHtml = sanitizeEditorHTML(rawHtml)
      onChange(sanitizedHtml)
    },
    editorProps: {
        attributes: {
            class: cn(
                "prose prose-sm dark:prose-invert max-w-none focus:outline-none p-4 min-h-[inherit]",
                "prose-headings:font-bold prose-headings:tracking-tight",
                "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
                "prose-pre:bg-bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg",
                "prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
                "prose-blockquote:border-l-primary prose-blockquote:bg-primary/5 prose-blockquote:py-1 prose-blockquote:pr-4",
            )
        }
    }
  })

  if (!editor) return null

  const toggleLink = () => {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)

    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    // ─── Z+ SECURITY: Validate URL protocol before setting link ───
    if (!isValidUrlProtocol(url)) {
      window.alert('Invalid URL protocol. Only http:, https:, mailto:, ftp:, ftps:, and relative URLs are allowed.')
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="border border-border rounded-xl bg-bg overflow-hidden flex flex-col group focus-within:border-primary/50 transition-colors" style={{ minHeight }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-1 border-b border-border bg-bg-subtle/50">
        <div className="flex items-center gap-0.5 px-1">
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={cn("h-8 w-8 p-0", editor.isActive('bold') && "bg-primary/10 text-primary hover:bg-primary/20")}
                title="Bold"
            >
                <Bold className="h-4 w-4" />
            </Button>
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={cn("h-8 w-8 p-0", editor.isActive('italic') && "bg-primary/10 text-primary hover:bg-primary/20")}
                title="Italic"
            >
                <Italic className="h-4 w-4" />
            </Button>
        </div>

        <Separator orientation="vertical" className="mx-1 h-4" />

        <div className="flex items-center gap-0.5 px-1">
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className={cn("h-8 w-8 p-0", editor.isActive('heading', { level: 1 }) && "bg-primary/10 text-primary hover:bg-primary/20")}
                title="Heading 1"
            >
                <Heading1 className="h-4 w-4" />
            </Button>
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={cn("h-8 w-8 p-0", editor.isActive('heading', { level: 2 }) && "bg-primary/10 text-primary hover:bg-primary/20")}
                title="Heading 2"
            >
                <Heading2 className="h-4 w-4" />
            </Button>
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => editor.chain().focus().setParagraph().run()}
                className={cn("h-8 w-8 p-0", editor.isActive('paragraph') && !editor.isActive('heading') && "bg-primary/10 text-primary")}
                title="Normal Text"
            >
                <Type className="h-4 w-4" />
            </Button>
        </div>

        <Separator orientation="vertical" className="mx-1 h-4" />

        <div className="flex items-center gap-0.5 px-1">
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={cn("h-8 w-8 p-0", editor.isActive('bulletList') && "bg-primary/10 text-primary hover:bg-primary/20")}
                title="Bullet List"
            >
                <List className="h-4 w-4" />
            </Button>
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={cn("h-8 w-8 p-0", editor.isActive('orderedList') && "bg-primary/10 text-primary hover:bg-primary/20")}
                title="Numbered List"
            >
                <ListOrdered className="h-4 w-4" />
            </Button>
        </div>

        <Separator orientation="vertical" className="mx-1 h-4" />

        <div className="flex items-center gap-0.5 px-1">
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                className={cn("h-8 w-8 p-0", editor.isActive('codeBlock') && "bg-primary/10 text-primary hover:bg-primary/20")}
                title="Code Block"
            >
                <Code className="h-4 w-4" />
            </Button>
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                className={cn("h-8 w-8 p-0", editor.isActive('blockquote') && "bg-primary/10 text-primary hover:bg-primary/20")}
                title="Blockquote"
            >
                <Quote className="h-4 w-4" />
            </Button>
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={toggleLink}
                className={cn("h-8 w-8 p-0", editor.isActive('link') && "bg-primary/10 text-primary hover:bg-primary/20")}
                title="Link"
            >
                <LinkIcon className="h-4 w-4" />
            </Button>
        </div>

        <div className="ml-auto flex items-center gap-0.5 px-1">
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                className="h-8 w-8 p-0"
                title="Undo"
            >
                <Undo className="h-4 w-4" />
            </Button>
            <Button 
                type="button"
                variant="ghost" 
                size="sm" 
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                className="h-8 w-8 p-0"
                title="Redo"
            >
                <Redo className="h-4 w-4" />
            </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: "inherit" }}>
        <style jsx global>{`
          .tiptap p.is-editor-empty:first-child::before {
            color: #737373;
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
          }
          .tiptap ul {
            list-style-type: disc;
            padding-left: 1.5rem;
          }
          .tiptap ol {
            list-style-type: decimal;
            padding-left: 1.5rem;
          }
        `}</style>
        <EditorContent editor={editor} className="min-h-full" />
      </div>
    </div>
  )
}
