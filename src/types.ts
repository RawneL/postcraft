export type BlockType = 'heading' | 'text' | 'button' | 'image' | 'divider' | 'spacer'
export type BuilderItemType = BlockType | 'wrapper' | 'section' | 'column'
export type NodeKind = 'wrapper' | 'section' | 'column' | 'block'
export type StyleMap = Record<string, string | number>

export interface EmailBlock { id: string; type: BlockType; content: string; styles: StyleMap }
export interface EmailColumn { id: string; type: 'column'; width: number; styles: StyleMap; blocks: EmailBlock[] }
export interface EmailSection { id: string; type: 'section'; styles: StyleMap; columns: EmailColumn[] }
export interface EmailWrapper { id: string; type: 'wrapper'; styles: StyleMap; sections: EmailSection[] }
export type EmailBodyItem = EmailSection | EmailWrapper

export interface EmailTheme {
  backgroundColor: string
  contentColor: string
  contentWidth: number
  fontFamily: string
  textColor: string
  linkColor: string
}

export interface EmailDocument {
  name: string
  subject: string
  preview: string
  theme: EmailTheme
  body: EmailBodyItem[]
}

export interface EmailPreset {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  document: EmailDocument
}

export interface SelectedNode {
  kind: NodeKind
  node: EmailWrapper | EmailSection | EmailColumn | EmailBlock
  wrapperId?: string
  sectionId?: string
  columnId?: string
}
