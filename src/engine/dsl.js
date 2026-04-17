// DSL Interpreter
// See DSL_SPEC.md for full specification.

// ─── Error Types ─────────────────────────────────────────────────────────────

export class DSLSyntaxError extends Error {
  constructor(msg, expression) {
    super(`DSLSyntaxError in "${expression}": ${msg}`);
    this.name = 'DSLSyntaxError';
  }
}

export class DSLReferenceError extends Error {
  constructor(ref, expression) {
    super(`DSLReferenceError in "${expression}": cannot resolve reference "${ref}"`);
    this.name = 'DSLReferenceError';
  }
}

export class DSLTypeError extends Error {
  constructor(msg, expression) {
    super(`DSLTypeError in "${expression}": ${msg}`);
    this.name = 'DSLTypeError';
  }
}

export class DSLArgumentError extends Error {
  constructor(fn, msg, expression) {
    super(`DSLArgumentError in "${expression}": function "${fn}" ${msg}`);
    this.name = 'DSLArgumentError';
  }
}

export class DSLRuntimeError extends Error {
  constructor(msg, expression) {
    super(`DSLRuntimeError in "${expression}": ${msg}`);
    this.name = 'DSLRuntimeError';
  }
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

const TOKEN = {
  NUMBER:  'NUMBER',
  IDENT:   'IDENT',
  DOT:     'DOT',
  COMMA:   'COMMA',
  LPAREN:  'LPAREN',
  RPAREN:  'RPAREN',
  OP:      'OP',
  EOF:     'EOF',
};

function tokenize(expression) {
  const tokens = [];
  let i = 0;
  const src = expression;

  while (i < src.length) {
    // whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    // numbers — strict shape: digits, optional single decimal point followed
    // by at least one digit. Rejects `3.`, `3.1.2`, `3..5`, `3.x`.
    if (/[0-9]/.test(src[i])) {
      const start = i;
      while (i < src.length && /[0-9]/.test(src[i])) i++;
      if (i < src.length && src[i] === '.') {
        i++; // consume the dot
        const fracStart = i;
        while (i < src.length && /[0-9]/.test(src[i])) i++;
        if (i === fracStart) {
          throw new DSLSyntaxError(
            `malformed number "${src.slice(start, i)}": decimal point must be followed by digits`,
            expression
          );
        }
        // After a valid fractional part, another '.' is illegal (e.g. `3.1.2`).
        if (i < src.length && src[i] === '.') {
          throw new DSLSyntaxError(
            `malformed number "${src.slice(start, i + 1)}": multiple decimal points`,
            expression
          );
        }
      }
      tokens.push({ type: TOKEN.NUMBER, value: parseFloat(src.slice(start, i)) });
      continue;
    }

    // identifiers (including references like item.x, score.x)
    if (/[a-zA-Z_]/.test(src[i])) {
      let id = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) id += src[i++];
      tokens.push({ type: TOKEN.IDENT, value: id });
      continue;
    }

    // two-char operators
    if (i + 1 < src.length) {
      const two = src[i] + src[i + 1];
      if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
        tokens.push({ type: TOKEN.OP, value: two });
        i += 2;
        continue;
      }
    }

    // single-char operators and punctuation
    const ch = src[i];
    if ('<>!+-*/'.includes(ch)) { tokens.push({ type: TOKEN.OP,     value: ch }); i++; continue; }
    if (ch === '.')              { tokens.push({ type: TOKEN.DOT,    value: ch }); i++; continue; }
    if (ch === ',')              { tokens.push({ type: TOKEN.COMMA,  value: ch }); i++; continue; }
    if (ch === '(')              { tokens.push({ type: TOKEN.LPAREN, value: ch }); i++; continue; }
    if (ch === ')')              { tokens.push({ type: TOKEN.RPAREN, value: ch }); i++; continue; }

    throw new DSLSyntaxError(`unexpected character "${ch}"`, expression);
  }

  tokens.push({ type: TOKEN.EOF, value: null });
  return tokens;
}

// ─── Parser ───────────────────────────────────────────────────────────────────
// Produces an AST. Each node: { kind, ... }

function parse(tokens, expression) {
  let pos = 0;

  const peek    = ()  => tokens[pos];
  const consume = ()  => tokens[pos++];
  const expect  = (type, value) => {
    const t = consume();
    if (t.type !== type || (value !== undefined && t.value !== value))
      throw new DSLSyntaxError(`expected ${value ?? type} but got "${t.value}"`, expression);
    return t;
  };

  function parseExpression() { return parseOr(); }

  function parseOr() {
    let left = parseAnd();
    while (peek().type === TOKEN.OP && peek().value === '||') {
      consume();
      left = { kind: 'logical', op: '||', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd() {
    let left = parseNot();
    while (peek().type === TOKEN.OP && peek().value === '&&') {
      consume();
      left = { kind: 'logical', op: '&&', left, right: parseNot() };
    }
    return left;
  }

  function parseNot() {
    if (peek().type === TOKEN.OP && peek().value === '!') {
      consume();
      return { kind: 'unary', op: '!', operand: parseNot() };
    }
    return parseComparison();
  }

  function parseComparison() {
    let left = parseAdditive();
    const ops = ['<', '>', '<=', '>=', '==', '!='];
    if (peek().type === TOKEN.OP && ops.includes(peek().value)) {
      const op = consume().value;
      left = { kind: 'comparison', op, left, right: parseAdditive() };
    }
    return left;
  }

  function parseAdditive() {
    let left = parseMultiplicative();
    while (peek().type === TOKEN.OP && ['+', '-'].includes(peek().value)) {
      const op = consume().value;
      left = { kind: 'binary', op, left, right: parseMultiplicative() };
    }
    return left;
  }

  function parseMultiplicative() {
    let left = parseUnary();
    while (peek().type === TOKEN.OP && ['*', '/'].includes(peek().value)) {
      const op = consume().value;
      left = { kind: 'binary', op, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary() {
    if (peek().type === TOKEN.OP && peek().value === '-') {
      consume();
      return { kind: 'unary', op: '-', operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();

    // parenthesised expression
    if (t.type === TOKEN.LPAREN) {
      consume();
      const node = parseExpression();
      expect(TOKEN.RPAREN);
      return node;
    }

    // number literal
    if (t.type === TOKEN.NUMBER) {
      consume();
      return { kind: 'literal', value: t.value };
    }

    // identifier — either a function call or a reference
    if (t.type === TOKEN.IDENT) {
      consume();
      const name = t.value;

      // function call
      if (peek().type === TOKEN.LPAREN) {
        consume(); // (
        const args = [];
        if (peek().type !== TOKEN.RPAREN) {
          args.push(parseExpression());
          while (peek().type === TOKEN.COMMA) {
            consume();
            args.push(parseExpression());
          }
        }
        expect(TOKEN.RPAREN);
        return { kind: 'call', name, args };
      }

      // reference: item.x, subscale.x, subscale.x.y, score.x
      // The part after the dot may be a plain identifier OR a numeric string (e.g. item.1)
      if (peek().type === TOKEN.DOT) {
        consume(); // first dot
        const tok1 = peek();
        if (tok1.type !== TOKEN.IDENT && tok1.type !== TOKEN.NUMBER)
          throw new DSLSyntaxError(`expected identifier after "."`, expression);
        consume();
        const part1 = String(tok1.value);

        // subscale.<questionnaireId>.<subscaleId>
        if (name === 'subscale' && peek().type === TOKEN.DOT) {
          consume(); // second dot
          const tok2 = peek();
          if (tok2.type !== TOKEN.IDENT && tok2.type !== TOKEN.NUMBER)
            throw new DSLSyntaxError(`expected identifier after "."`, expression);
          consume();
          const part2 = String(tok2.value);
          return { kind: 'ref', ref: 'subscale_q', questionnaireId: part1, subscaleId: part2 };
        }

        // item.<questionnaireId>.<itemId> — qualified cross-questionnaire reference (battery level)
        if (name === 'item' && peek().type === TOKEN.DOT) {
          consume(); // second dot
          const tok2 = peek();
          if (tok2.type !== TOKEN.IDENT && tok2.type !== TOKEN.NUMBER)
            throw new DSLSyntaxError(`expected identifier after "."`, expression);
          consume();
          const part2 = String(tok2.value);
          return { kind: 'ref', ref: 'item_q', questionnaireId: part1, itemId: part2 };
        }

        return { kind: 'ref', ref: name, id: part1 };
      }

      throw new DSLSyntaxError(`unexpected identifier "${name}"`, expression);
    }

    throw new DSLSyntaxError(`unexpected token "${t.value}"`, expression);
  }

  const ast = parseExpression();
  if (peek().type !== TOKEN.EOF)
    throw new DSLSyntaxError(`unexpected token "${peek().value}" after expression`, expression);
  return ast;
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

function evalNode(node, context, expression) {
  switch (node.kind) {

    case 'literal':
      return node.value;

    case 'ref': {
      const { ref, id } = node;
      if (ref === 'subscale_q') {
        const { questionnaireId, subscaleId } = node;
        if (!context.subscale || !context.subscale[questionnaireId] ||
            !(subscaleId in context.subscale[questionnaireId]))
          throw new DSLReferenceError(`subscale.${questionnaireId}.${subscaleId}`, expression);
        return context.subscale[questionnaireId][subscaleId];
      }
      if (ref === 'item_q') {
        // Qualified: item.<questionnaireId>.<itemId> — battery-level cross-questionnaire reference
        const { questionnaireId, itemId } = node;
        if (!context.item || !context.item[questionnaireId] ||
            !(itemId in context.item[questionnaireId]))
          throw new DSLReferenceError(`item.${questionnaireId}.${itemId}`, expression);
        return context.item[questionnaireId][itemId];
      }
      if (ref === 'item') {
        if (!context.item || !(id in context.item))
          throw new DSLReferenceError(`item.${id}`, expression);
        return context.item[id];
      }
      if (ref === 'subscale') {
        if (!context.subscale || !(id in context.subscale))
          throw new DSLReferenceError(`subscale.${id}`, expression);
        return context.subscale[id];
      }
      if (ref === 'score') {
        if (!context.score || !(id in context.score))
          throw new DSLReferenceError(`score.${id}`, expression);
        return context.score[id];
      }
      throw new DSLReferenceError(`${ref}.${id}`, expression);
    }

    case 'unary': {
      const val = evalNode(node.operand, context, expression);
      if (node.op === '-') {
        if (typeof val !== 'number') throw new DSLTypeError(`unary "-" requires number`, expression);
        return -val;
      }
      if (node.op === '!') {
        if (typeof val !== 'boolean') throw new DSLTypeError(`"!" requires boolean`, expression);
        return !val;
      }
      break;
    }

    case 'binary': {
      const l = evalNode(node.left, context, expression);
      const r = evalNode(node.right, context, expression);
      if (typeof l !== 'number' || typeof r !== 'number')
        throw new DSLTypeError(`"${node.op}" requires numeric operands`, expression);
      if (node.op === '+') return l + r;
      if (node.op === '-') return l - r;
      if (node.op === '*') return l * r;
      if (node.op === '/') {
        if (r === 0) throw new DSLRuntimeError('division by zero', expression);
        return l / r;
      }
      break;
    }

    case 'comparison': {
      const l = evalNode(node.left, context, expression);
      const r = evalNode(node.right, context, expression);
      if (typeof l !== 'number' || typeof r !== 'number')
        throw new DSLTypeError(`"${node.op}" requires numeric operands — string and array comparison is not supported`, expression);
      if (node.op === '<')  return l < r;
      if (node.op === '>')  return l > r;
      if (node.op === '<=') return l <= r;
      if (node.op === '>=') return l >= r;
      if (node.op === '==') return l === r;
      if (node.op === '!=') return l !== r;
      break;
    }

    case 'logical': {
      const l = evalNode(node.left, context, expression);
      if (typeof l !== 'boolean')
        throw new DSLTypeError(`"${node.op}" requires boolean operands`, expression);
      // short-circuit
      if (node.op === '&&' && !l) return false;
      if (node.op === '||' && l)  return true;
      const r = evalNode(node.right, context, expression);
      if (typeof r !== 'boolean')
        throw new DSLTypeError(`"${node.op}" requires boolean operands`, expression);
      return node.op === '&&' ? l && r : l || r;
    }

    case 'call': {
      const { name, args } = node;

      if (name === 'if') {
        if (args.length !== 3)
          throw new DSLArgumentError('if', 'requires exactly 3 arguments', expression);
        const cond = evalNode(args[0], context, expression);
        if (typeof cond !== 'boolean')
          throw new DSLTypeError('"if" condition must be boolean', expression);
        const thenVal = evalNode(args[1], context, expression);
        const elseVal = evalNode(args[2], context, expression);
        if (typeof thenVal !== typeof elseVal)
          throw new DSLTypeError('"if" branches must return the same type', expression);
        return cond ? thenVal : elseVal;
      }

      const NUMERIC_FNS = { sum: true, avg: true, min: true, max: true };
      if (NUMERIC_FNS[name]) {
        if (args.length === 0)
          throw new DSLArgumentError(name, 'requires at least 1 argument', expression);
        const vals = args.map(a => {
          const v = evalNode(a, context, expression);
          if (typeof v !== 'number')
            throw new DSLTypeError(`"${name}" requires numeric arguments`, expression);
          return v;
        });
        if (name === 'sum') return vals.reduce((a, b) => a + b, 0);
        if (name === 'avg') return vals.reduce((a, b) => a + b, 0) / vals.length;
        if (name === 'min') return Math.min(...vals);
        if (name === 'max') return Math.max(...vals);
      }

      // count(ref) — number of selected options in a multiselect answer.
      // Returns the array length for arrays, 1 for non-null scalars, 0 for null.
      if (name === 'count') {
        if (args.length !== 1)
          throw new DSLArgumentError('count', 'requires exactly 1 argument', expression);
        const val = evalNode(args[0], context, expression);
        if (Array.isArray(val)) return val.length;
        if (val == null)        return 0;
        return 1;
      }

      // checked(ref, n) — true if 1-based index n is selected in a multiselect answer.
      if (name === 'checked') {
        if (args.length !== 2)
          throw new DSLArgumentError('checked', 'requires exactly 2 arguments', expression);
        const collection = evalNode(args[0], context, expression);
        const n          = evalNode(args[1], context, expression);
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 1)
          throw new DSLArgumentError('checked', 'second argument must be a positive integer', expression);
        if (!Array.isArray(collection)) return false;
        return collection.includes(n);
      }

      throw new DSLSyntaxError(`unknown function "${name}"`, expression);
    }
  }

  throw new DSLSyntaxError(`unknown node kind "${node.kind}"`, expression);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a DSL expression string.
 *
 * @param {string} expression       - The DSL expression
 * @param {object} context          - Resolution context
 * @param {'number'|'boolean'} expected - Expected return type
 * @returns {number|boolean}
 */
export function evaluate(expression, context, expected) {
  const tokens = tokenize(expression);
  const ast    = parse(tokens, expression);
  const result = evalNode(ast, context, expression);

  if (expected && typeof result !== expected)
    throw new DSLTypeError(
      `expected ${expected} but expression returned ${typeof result}`,
      expression
    );

  return result;
}
