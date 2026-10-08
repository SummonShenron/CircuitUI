import type { CircuitComponent, Screen } from '../types'

// A small, safe formula language for Visibility conditions and Set-variable
// values - e.g. `exampleUsed != true`, `{{count}} + 1`, `{{name}} != ""`.
// Deliberately NOT eval()/Function() - hand-rolled tokenizer, recursive
// descent parser, and tree-walking evaluator over a narrow grammar:
//
//   expr       := or
//   or         := and ( '||' and )*
//   and        := equality ( '&&' equality )*
//   equality   := comparison ( ('==' | '!=') comparison )*
//   comparison := additive ( ('<' | '<=' | '>' | '>=') additive )*
//   additive   := multiplicative ( ('+' | '-') multiplicative )*
//   multiplicative := unary ( ('*' | '/') unary )*
//   unary      := ('!' | '-') unary | primary
//   primary    := NUMBER | STRING | 'true' | 'false' | 'null' | IDENTIFIER | '(' expr ')'
//
// `{{component_id}}` references are substituted with a JSON-literal of that
// component's current live value *before* tokenizing, so the parser never
// has to know about them. A bare identifier is a variable lookup instead.

type Token = { type: 'number' | 'string' | 'identifier' | 'op' | 'eof'; value: string }

type Node =
  | { kind: 'literal'; value: unknown }
  | { kind: 'identifier'; name: string }
  | { kind: 'unary'; op: '!' | '-'; arg: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }

// `.` is allowed so `{{item.field}}` matches as one token - component ids
// (crypto.randomUUID-derived) never contain a dot, so there's no ambiguity.
const COMPONENT_REF_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g

export function componentLiveValue(component: CircuitComponent, runtimeValues: Record<string, unknown>): unknown {
  if (component.id in runtimeValues) return runtimeValues[component.id]
  if (component.type === 'text_input') return component.props.value ?? ''
  if (component.type === 'label') return component.props.text ?? ''
  return null
}

// `{{item}}`/`{{item.field}}` resolve against the current row inside a List
// template (see Canvas.tsx); everything else is a `{{component_id}}` ref.
function resolveRefToken(token: string, screen: Screen, runtimeValues: Record<string, unknown>, item: unknown): unknown {
  if (token === 'item') return item ?? null
  if (token.startsWith('item.')) {
    const field = token.slice('item.'.length)
    return item && typeof item === 'object' ? ((item as Record<string, unknown>)[field] ?? null) : null
  }
  const component = screen.components.find((candidate) => candidate.id === token)
  return component ? (componentLiveValue(component, runtimeValues) ?? null) : null
}

function substituteComponentRefs(expression: string, screen: Screen, runtimeValues: Record<string, unknown>, item?: unknown): string {
  return expression.replace(COMPONENT_REF_PATTERN, (_match, token: string) => JSON.stringify(resolveRefToken(token, screen, runtimeValues, item)))
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const twoCharOps = new Set(['==', '!=', '<=', '>=', '&&', '||'])
  while (i < source.length) {
    const char = source[i]
    if (/\s/.test(char)) { i += 1; continue }
    if (char === '"' || char === "'") {
      const quote = char
      let value = ''
      i += 1
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < source.length) { value += source[i + 1]; i += 2 } else { value += source[i]; i += 1 }
      }
      i += 1
      tokens.push({ type: 'string', value })
      continue
    }
    if (/[0-9]/.test(char)) {
      let value = ''
      while (i < source.length && /[0-9.]/.test(source[i])) { value += source[i]; i += 1 }
      tokens.push({ type: 'number', value })
      continue
    }
    if (/[A-Za-z_]/.test(char)) {
      let value = ''
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) { value += source[i]; i += 1 }
      tokens.push({ type: 'identifier', value })
      continue
    }
    const two = source.slice(i, i + 2)
    if (twoCharOps.has(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue }
    if ('()!<>+-*/'.includes(char)) { tokens.push({ type: 'op', value: char }); i += 1; continue }
    // Unrecognized character - skip it rather than fail the whole expression.
    i += 1
  }
  tokens.push({ type: 'eof', value: '' })
  return tokens
}

class Parser {
  private pos = 0
  private tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek() { return this.tokens[this.pos] }
  private next() { return this.tokens[this.pos++] }
  private expectOp(op: string) {
    const token = this.next()
    if (token.type !== 'op' || token.value !== op) throw new Error(`Expected '${op}'`)
  }

  parseExpression(): Node { return this.parseOr() }

  private parseOr(): Node {
    let node = this.parseAnd()
    while (this.peek().type === 'op' && this.peek().value === '||') {
      this.next()
      node = { kind: 'binary', op: '||', left: node, right: this.parseAnd() }
    }
    return node
  }

  private parseAnd(): Node {
    let node = this.parseEquality()
    while (this.peek().type === 'op' && this.peek().value === '&&') {
      this.next()
      node = { kind: 'binary', op: '&&', left: node, right: this.parseEquality() }
    }
    return node
  }

  private parseEquality(): Node {
    let node = this.parseComparison()
    while (this.peek().type === 'op' && (this.peek().value === '==' || this.peek().value === '!=')) {
      const op = this.next().value
      node = { kind: 'binary', op, left: node, right: this.parseComparison() }
    }
    return node
  }

  private parseComparison(): Node {
    let node = this.parseAdditive()
    while (this.peek().type === 'op' && ['<', '<=', '>', '>='].includes(this.peek().value)) {
      const op = this.next().value
      node = { kind: 'binary', op, left: node, right: this.parseAdditive() }
    }
    return node
  }

  private parseAdditive(): Node {
    let node = this.parseMultiplicative()
    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value
      node = { kind: 'binary', op, left: node, right: this.parseMultiplicative() }
    }
    return node
  }

  private parseMultiplicative(): Node {
    let node = this.parseUnary()
    while (this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.next().value
      node = { kind: 'binary', op, left: node, right: this.parseUnary() }
    }
    return node
  }

  private parseUnary(): Node {
    if (this.peek().type === 'op' && (this.peek().value === '!' || this.peek().value === '-')) {
      const op = this.next().value as '!' | '-'
      return { kind: 'unary', op, arg: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Node {
    const token = this.next()
    if (token.type === 'number') return { kind: 'literal', value: Number(token.value) }
    if (token.type === 'string') return { kind: 'literal', value: token.value }
    if (token.type === 'identifier') {
      if (token.value === 'true') return { kind: 'literal', value: true }
      if (token.value === 'false') return { kind: 'literal', value: false }
      if (token.value === 'null') return { kind: 'literal', value: null }
      return { kind: 'identifier', name: token.value }
    }
    if (token.type === 'op' && token.value === '(') {
      const node = this.parseExpression()
      this.expectOp(')')
      return node
    }
    throw new Error(`Unexpected token '${token.value}'`)
  }
}

function isTruthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== '' && value !== 0
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (typeof a === typeof b) return a === b
  return String(a) === String(b)
}

function evaluateNode(node: Node, variables: Record<string, unknown>): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value
    case 'identifier':
      return variables[node.name]
    case 'unary': {
      const value = evaluateNode(node.arg, variables)
      return node.op === '!' ? !isTruthy(value) : -Number(value)
    }
    case 'binary': {
      if (node.op === '&&') return isTruthy(evaluateNode(node.left, variables)) && isTruthy(evaluateNode(node.right, variables))
      if (node.op === '||') return isTruthy(evaluateNode(node.left, variables)) || isTruthy(evaluateNode(node.right, variables))
      const left = evaluateNode(node.left, variables)
      const right = evaluateNode(node.right, variables)
      switch (node.op) {
        case '==': return looseEquals(left, right)
        case '!=': return !looseEquals(left, right)
        case '<': return Number(left) < Number(right)
        case '<=': return Number(left) <= Number(right)
        case '>': return Number(left) > Number(right)
        case '>=': return Number(left) >= Number(right)
        case '+': return typeof left === 'string' || typeof right === 'string' ? String(left) + String(right) : Number(left) + Number(right)
        case '-': return Number(left) - Number(right)
        case '*': return Number(left) * Number(right)
        case '/': return Number(left) / Number(right)
        default: return undefined
      }
    }
  }
}

/** Evaluates a formula to its raw value (used for Set-variable's value field). Returns `undefined` on any parse/eval error rather than throwing. */
export function evaluateExpression(
  expression: string,
  screen: Screen,
  runtimeValues: Record<string, unknown>,
  variables: Record<string, unknown>,
  item?: unknown,
): unknown {
  if (!expression || !expression.trim()) return undefined
  try {
    const substituted = substituteComponentRefs(expression, screen, runtimeValues, item)
    const ast = new Parser(tokenize(substituted)).parseExpression()
    return evaluateNode(ast, variables)
  } catch {
    return undefined
  }
}

/** Evaluates a Visibility condition. Blank, or any parse/eval error, fails open to visible so a typo never silently disappears a component. `item` is the current row when evaluated inside a List template (see Canvas.tsx). */
export function evaluateVisibility(
  expression: string | null | undefined,
  screen: Screen,
  runtimeValues: Record<string, unknown>,
  variables: Record<string, unknown>,
  item?: unknown,
): boolean {
  if (!expression || !expression.trim()) return true
  try {
    const substituted = substituteComponentRefs(expression, screen, runtimeValues, item)
    const ast = new Parser(tokenize(substituted)).parseExpression()
    return isTruthy(evaluateNode(ast, variables))
  } catch {
    return true
  }
}
