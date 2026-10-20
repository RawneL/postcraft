declare module 'mjml-browser' {
  interface MjmlOptions {
    validationLevel?: 'strict' | 'soft' | 'skip'
    minify?: boolean
  }
  interface MjmlResult {
    html: string
    errors: Array<{ line: number; message: string; tagName?: string }>
  }
  export default function mjml2html(input: string, options?: MjmlOptions): MjmlResult
}
