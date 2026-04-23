

export interface Column {
  type: string
  $isArray?: boolean
  $optional?: boolean
}

export interface Junction {
  joining: string
  joined: string
  junctionName: string
  cantUnrelate?: boolean
}

export interface ClassWikiBase {
  $className: string
  $tableName: string
  $relationalProps: string[]
  $isArray?: boolean
  $optional?: boolean
  $junctionInfo?: Junction
  $referencers?: Record<string, string[]>
  $dependents?: Record<string, string[]>
}

/**
 * Recursive dynamic properties:
 * - known $props are fixed above
 * - everything else is Column | ClassWiki
 */
export interface ClassWiki extends ClassWikiBase {
  [key: string]: Column | ClassWiki 
}