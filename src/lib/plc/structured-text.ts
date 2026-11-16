/**
 * Portado desde Open-Industry-Project/Open-Industry-Project (plc/*).
 * Compilador completo de IEC 61131-3 Structured Text (ST) con lexer, parser AST,
 * variables locales (VAR/END_VAR), sentencias IF/THEN/ELSIF/ELSE, FOR, WHILE, CASE,
 * expresiones aritméticas/booleanas y generación + ejecución de bytecode intermedio.
 */

export type TipoDatoST = 'BOOL' | 'INT' | 'REAL' | 'STRING';
export type ValorST = number | boolean | string;

export interface VariableST {
  nombre: string;
  tipo: TipoDatoST;
  alcance: 'LOCAL' | 'INPUT' | 'OUTPUT';
  valorInicial: ValorST;
}

export type TokenTipo =
  | 'IDENT'
  | 'NUMBER'
  | 'STRING'
  | 'BOOL'
  | 'KEYWORD'
  | 'ASSIGN'
  | 'EQ'
  | 'NEQ'
  | 'LT'
  | 'LTE'
  | 'GT'
  | 'GTE'
  | 'PLUS'
  | 'MINUS'
  | 'MUL'
  | 'DIV'
  | 'LPAREN'
  | 'RPAREN'
  | 'SEMI'
  | 'COLON'
  | 'COMMA'
  | 'DOTDOT'
  | 'EOF';

export interface TokenST {
  tipo: TokenTipo;
  lexema: string;
  linea: number;
  columna: number;
}

export type OpcodeST =
  | 'PUSH_CONST'
  | 'LOAD_VAR'
  | 'STORE_VAR'
  | 'ADD'
  | 'SUB'
  | 'MUL'
  | 'DIV'
  | 'MOD'
  | 'NEG'
  | 'NOT'
  | 'AND'
  | 'OR'
  | 'XOR'
  | 'EQ'
  | 'NEQ'
  | 'LT'
  | 'LTE'
  | 'GT'
  | 'GTE'
  | 'JMP'
  | 'JMP_IF_FALSE'
  | 'DUP'
  | 'POP'
  | 'HALT';

export interface InstruccionBytecode {
  op: OpcodeST;
  arg?: ValorST | number;
}

export interface ProgramaCompiladoST {
  exito: boolean;
  errores: string[];
  variables: VariableST[];
  bytecode: InstruccionBytecode[];
}

export interface ResultadoEjecucionST {
  memoria: Record<string, ValorST>;
  instruccionesEjecutadas: number;
  error?: string;
}

const KEYWORDS = new Set([
  'VAR',
  'VAR_INPUT',
  'VAR_OUTPUT',
  'END_VAR',
  'PROGRAM',
  'END_PROGRAM',
  'BOOL',
  'INT',
  'REAL',
  'STRING',
  'IF',
  'THEN',
  'ELSIF',
  'ELSE',
  'END_IF',
  'FOR',
  'TO',
  'BY',
  'DO',
  'END_FOR',
  'WHILE',
  'END_WHILE',
  'CASE',
  'OF',
  'END_CASE',
  'AND',
  'OR',
  'XOR',
  'NOT',
  'MOD',
]);

export function tokenizarStructuredText(fuente: string): TokenST[] {
  const tokens: TokenST[] = [];
  let i = 0;
  let linea = 1;
  let columna = 1;
  const len = fuente.length;

  const avanzar = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (fuente[i] === '\n') {
        linea++;
        columna = 1;
      } else {
        columna++;
      }
      i++;
    }
  };

  while (i < len) {
    const ch = fuente[i];

    // Espacios
    if (/\s/.test(ch)) {
      avanzar();
      continue;
    }

    // Comentarios // ...
    if (ch === '/' && fuente[i + 1] === '/') {
      while (i < len && fuente[i] !== '\n') avanzar();
      continue;
    }

    // Comentarios (* ... *)
    if (ch === '(' && fuente[i + 1] === '*') {
      avanzar(2);
      while (i < len && !(fuente[i] === '*' && fuente[i + 1] === ')')) {
        avanzar();
      }
      if (i < len) avanzar(2);
      continue;
    }

    const startLine = linea;
    const startCol = columna;

    // Cadenas entre comillas simples
    if (ch === "'") {
      avanzar();
      let str = '';
      while (i < len && fuente[i] !== "'") {
        str += fuente[i];
        avanzar();
      }
      if (i < len) avanzar();
      tokens.push({ tipo: 'STRING', lexema: str, linea: startLine, columna: startCol });
      continue;
    }

    // Números (enteros o reales)
    if (/[0-9]/.test(ch)) {
      let num = '';
      while (i < len && /[0-9]/.test(fuente[i])) {
        num += fuente[i];
        avanzar();
      }
      if (fuente[i] === '.' && fuente[i + 1] !== '.' && /[0-9]/.test(fuente[i + 1] ?? '')) {
        num += '.';
        avanzar();
        while (i < len && /[0-9]/.test(fuente[i])) {
          num += fuente[i];
          avanzar();
        }
      }
      tokens.push({ tipo: 'NUMBER', lexema: num, linea: startLine, columna: startCol });
      continue;
    }

    // Identificadores y palabras clave
    if (/[A-Za-z_]/.test(ch)) {
      let id = '';
      while (i < len && /[A-Za-z0-9_]/.test(fuente[i])) {
        id += fuente[i];
        avanzar();
      }
      const upper = id.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ tipo: 'BOOL', lexema: upper, linea: startLine, columna: startCol });
      } else if (KEYWORDS.has(upper)) {
        tokens.push({ tipo: 'KEYWORD', lexema: upper, linea: startLine, columna: startCol });
      } else {
        tokens.push({ tipo: 'IDENT', lexema: id, linea: startLine, columna: startCol });
      }
      continue;
    }

    // Operadores compuestos
    const two = fuente.slice(i, i + 2);
    if (two === ':=') {
      tokens.push({ tipo: 'ASSIGN', lexema: ':=', linea: startLine, columna: startCol });
      avanzar(2);
      continue;
    }
    if (two === '<>') {
      tokens.push({ tipo: 'NEQ', lexema: '<>', linea: startLine, columna: startCol });
      avanzar(2);
      continue;
    }
    if (two === '<=') {
      tokens.push({ tipo: 'LTE', lexema: '<=', linea: startLine, columna: startCol });
      avanzar(2);
      continue;
    }
    if (two === '>=') {
      tokens.push({ tipo: 'GTE', lexema: '>=', linea: startLine, columna: startCol });
      avanzar(2);
      continue;
    }
    if (two === '..') {
      tokens.push({ tipo: 'DOTDOT', lexema: '..', linea: startLine, columna: startCol });
      avanzar(2);
      continue;
    }

    // Operadores simples
    const mapaSimple: Record<string, TokenTipo> = {
      '=': 'EQ',
      '<': 'LT',
      '>': 'GT',
      '+': 'PLUS',
      '-': 'MINUS',
      '*': 'MUL',
      '/': 'DIV',
      '(': 'LPAREN',
      ')': 'RPAREN',
      ';': 'SEMI',
      ':': 'COLON',
      ',': 'COMMA',
    };

    if (mapaSimple[ch]) {
      tokens.push({ tipo: mapaSimple[ch], lexema: ch, linea: startLine, columna: startCol });
      avanzar();
      continue;
    }

    throw new Error(`Carácter inesperado '${ch}' en línea ${startLine}:${startCol}`);
  }

  tokens.push({ tipo: 'EOF', lexema: '', linea, columna });
  return tokens;
}

class ParserCompiladorST {
  private pos = 0;
  readonly bytecode: InstruccionBytecode[] = [];
  readonly variables: VariableST[] = [];

  constructor(private readonly tokens: TokenST[]) {}

  private actual(): TokenST {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
  }

  private coincide(tipo: TokenTipo, lexema?: string): boolean {
    const t = this.actual();
    if (t.tipo !== tipo) return false;
    if (lexema !== undefined && t.lexema !== lexema) return false;
    return true;
  }

  private consumir(tipo: TokenTipo, lexema?: string): TokenST {
    const t = this.actual();
    if (!this.coincide(tipo, lexema)) {
      throw new Error(
        `Se esperaba ${lexema ?? tipo}, encontrado '${t.lexema || 'EOF'}' en línea ${t.linea}:${t.columna}`
      );
    }
    this.pos++;
    return t;
  }

  private emitir(op: OpcodeST, arg?: ValorST | number): number {
    this.bytecode.push(arg !== undefined ? { op, arg } : { op });
    return this.bytecode.length - 1;
  }

  private parchearSalto(idx: number, destino: number): void {
    this.bytecode[idx].arg = destino;
  }

  compilar(): void {
    const tieneProgram = this.coincide('KEYWORD', 'PROGRAM');
    if (tieneProgram) {
      this.consumir('KEYWORD', 'PROGRAM');
      if (this.coincide('IDENT')) this.consumir('IDENT');
      if (this.coincide('SEMI')) this.consumir('SEMI');
    }

    while (
      this.coincide('KEYWORD', 'VAR') ||
      this.coincide('KEYWORD', 'VAR_INPUT') ||
      this.coincide('KEYWORD', 'VAR_OUTPUT')
    ) {
      this.parsearBloqueVar();
    }

    while (!this.coincide('EOF') && !this.coincide('KEYWORD', 'END_PROGRAM')) {
      this.parsearSentencia();
    }

    if (tieneProgram && this.coincide('KEYWORD', 'END_PROGRAM')) {
      this.consumir('KEYWORD', 'END_PROGRAM');
    }

    this.emitir('HALT');
  }

  private parsearBloqueVar(): void {
    const kw = this.consumir('KEYWORD').lexema;
    const alcance: VariableST['alcance'] =
      kw === 'VAR_INPUT' ? 'INPUT' : kw === 'VAR_OUTPUT' ? 'OUTPUT' : 'LOCAL';

    while (!this.coincide('KEYWORD', 'END_VAR')) {
      if (this.coincide('EOF')) {
        throw new Error('Falta END_VAR para cerrar bloque de variables');
      }
      const ident = this.consumir('IDENT').lexema;
      this.consumir('COLON');
      const tipoTok = this.consumir('KEYWORD').lexema;
      const tipo: TipoDatoST =
        tipoTok === 'BOOL' || tipoTok === 'INT' || tipoTok === 'REAL' || tipoTok === 'STRING'
          ? tipoTok
          : 'REAL';

      let valorInicial: ValorST = tipo === 'BOOL' ? false : tipo === 'STRING' ? '' : 0;
      if (this.coincide('ASSIGN')) {
        this.consumir('ASSIGN');
        const neg = this.coincide('MINUS');
        if (neg) this.consumir('MINUS');
        const lit = this.actual();
        if (lit.tipo === 'NUMBER') {
          this.pos++;
          const num = Number(lit.lexema);
          valorInicial = neg ? -num : num;
        } else if (lit.tipo === 'BOOL') {
          this.pos++;
          valorInicial = lit.lexema === 'TRUE';
        } else if (lit.tipo === 'STRING') {
          this.pos++;
          valorInicial = lit.lexema;
        } else {
          throw new Error(`Valor inicial inválido para ${ident} en línea ${lit.linea}`);
        }
      }

      this.consumir('SEMI');
      this.variables.push({ nombre: ident, tipo, alcance, valorInicial });
    }
    this.consumir('KEYWORD', 'END_VAR');
  }

  private parsearSentencia(): void {
    const t = this.actual();

    if (t.tipo === 'KEYWORD' && t.lexema === 'IF') {
      this.parsearIf();
      return;
    }
    if (t.tipo === 'KEYWORD' && t.lexema === 'FOR') {
      this.parsearFor();
      return;
    }
    if (t.tipo === 'KEYWORD' && t.lexema === 'WHILE') {
      this.parsearWhile();
      return;
    }
    if (t.tipo === 'KEYWORD' && t.lexema === 'CASE') {
      this.parsearCase();
      return;
    }
    if (t.tipo === 'IDENT') {
      const nombre = this.consumir('IDENT').lexema;
      this.consumir('ASSIGN');
      this.parsearExpresion();
      this.consumir('SEMI');
      this.emitir('STORE_VAR', nombre);
      return;
    }

    throw new Error(
      `Sentencia no válida '${t.lexema}' en línea ${t.linea}:${t.columna}`
    );
  }

  private esCierreBloqueIf(): boolean {
    return (
      this.coincide('KEYWORD', 'ELSIF') ||
      this.coincide('KEYWORD', 'ELSE') ||
      this.coincide('KEYWORD', 'END_IF') ||
      this.coincide('EOF')
    );
  }

  private parsearIf(): void {
    this.consumir('KEYWORD', 'IF');
    const saltosFin: number[] = [];

    this.parsearExpresion();
    this.consumir('KEYWORD', 'THEN');
    let saltoFalso = this.emitir('JMP_IF_FALSE', 0);

    while (!this.esCierreBloqueIf()) {
      this.parsearSentencia();
    }

    while (this.coincide('KEYWORD', 'ELSIF')) {
      saltosFin.push(this.emitir('JMP', 0));
      this.parchearSalto(saltoFalso, this.bytecode.length);
      this.consumir('KEYWORD', 'ELSIF');
      this.parsearExpresion();
      this.consumir('KEYWORD', 'THEN');
      saltoFalso = this.emitir('JMP_IF_FALSE', 0);
      while (!this.esCierreBloqueIf()) {
        this.parsearSentencia();
      }
    }

    if (this.coincide('KEYWORD', 'ELSE')) {
      saltosFin.push(this.emitir('JMP', 0));
      this.parchearSalto(saltoFalso, this.bytecode.length);
      this.consumir('KEYWORD', 'ELSE');
      while (!this.coincide('KEYWORD', 'END_IF') && !this.coincide('EOF')) {
        this.parsearSentencia();
      }
    } else {
      this.parchearSalto(saltoFalso, this.bytecode.length);
    }

    this.consumir('KEYWORD', 'END_IF');
    if (this.coincide('SEMI')) this.consumir('SEMI');

    const finIdx = this.bytecode.length;
    for (const s of saltosFin) {
      this.parchearSalto(s, finIdx);
    }
  }

  private parsearFor(): void {
    this.consumir('KEYWORD', 'FOR');
    const varCtrl = this.consumir('IDENT').lexema;
    this.consumir('ASSIGN');
    this.parsearExpresion();
    this.emitir('STORE_VAR', varCtrl);

    this.consumir('KEYWORD', 'TO');
    const tmpLimite = `__for_lim_${this.bytecode.length}`;
    this.parsearExpresion();
    this.emitir('STORE_VAR', tmpLimite);

    const tmpPaso = `__for_step_${this.bytecode.length}`;
    if (this.coincide('KEYWORD', 'BY')) {
      this.consumir('KEYWORD', 'BY');
      this.parsearExpresion();
      this.emitir('STORE_VAR', tmpPaso);
    } else {
      this.emitir('PUSH_CONST', 1);
      this.emitir('STORE_VAR', tmpPaso);
    }

    this.consumir('KEYWORD', 'DO');

    const inicioLoop = this.bytecode.length;
    this.emitir('LOAD_VAR', varCtrl);
    this.emitir('LOAD_VAR', tmpLimite);
    this.emitir('LTE');
    const saltoSalida = this.emitir('JMP_IF_FALSE', 0);

    while (!this.coincide('KEYWORD', 'END_FOR') && !this.coincide('EOF')) {
      this.parsearSentencia();
    }
    this.consumir('KEYWORD', 'END_FOR');
    if (this.coincide('SEMI')) this.consumir('SEMI');

    this.emitir('LOAD_VAR', varCtrl);
    this.emitir('LOAD_VAR', tmpPaso);
    this.emitir('ADD');
    this.emitir('STORE_VAR', varCtrl);
    this.emitir('JMP', inicioLoop);
    this.parchearSalto(saltoSalida, this.bytecode.length);
  }

  private parsearWhile(): void {
    this.consumir('KEYWORD', 'WHILE');
    const inicioLoop = this.bytecode.length;
    this.parsearExpresion();
    this.consumir('KEYWORD', 'DO');
    const saltoSalida = this.emitir('JMP_IF_FALSE', 0);

    while (!this.coincide('KEYWORD', 'END_WHILE') && !this.coincide('EOF')) {
      this.parsearSentencia();
    }
    this.consumir('KEYWORD', 'END_WHILE');
    if (this.coincide('SEMI')) this.consumir('SEMI');

    this.emitir('JMP', inicioLoop);
    this.parchearSalto(saltoSalida, this.bytecode.length);
  }

  private parsearCase(): void {
    this.consumir('KEYWORD', 'CASE');
    const tmpSel = `__case_sel_${this.bytecode.length}`;
    this.parsearExpresion();
    this.emitir('STORE_VAR', tmpSel);
    this.consumir('KEYWORD', 'OF');

    const saltosFin: number[] = [];

    while (
      !this.coincide('KEYWORD', 'ELSE') &&
      !this.coincide('KEYWORD', 'END_CASE') &&
      !this.coincide('EOF')
    ) {
      const saltosCuerpo: number[] = [];
      // Lista de etiquetas de caso separadas por coma
      do {
        if (this.coincide('COMMA')) this.consumir('COMMA');
        this.emitir('LOAD_VAR', tmpSel);
        this.parsearExpresion();
        this.emitir('EQ');
        const jmpNoMatch = this.emitir('JMP_IF_FALSE', 0);
        saltosCuerpo.push(this.emitir('JMP', 0));
        this.parchearSalto(jmpNoMatch, this.bytecode.length);
      } while (this.coincide('COMMA'));

      const saltoSiguienteRama = this.emitir('JMP', 0);
      this.consumir('COLON');

      const inicioCuerpo = this.bytecode.length;
      for (const s of saltosCuerpo) this.parchearSalto(s, inicioCuerpo);

      while (
        !this.coincide('KEYWORD', 'ELSE') &&
        !this.coincide('KEYWORD', 'END_CASE') &&
        !(
          (this.coincide('NUMBER') || this.coincide('STRING')) &&
          this.tokens[this.pos + 1]?.tipo === 'COLON'
        ) &&
        !this.coincide('EOF')
      ) {
        this.parsearSentencia();
      }

      saltosFin.push(this.emitir('JMP', 0));
      this.parchearSalto(saltoSiguienteRama, this.bytecode.length);
    }

    if (this.coincide('KEYWORD', 'ELSE')) {
      this.consumir('KEYWORD', 'ELSE');
      while (!this.coincide('KEYWORD', 'END_CASE') && !this.coincide('EOF')) {
        this.parsearSentencia();
      }
    }

    this.consumir('KEYWORD', 'END_CASE');
    if (this.coincide('SEMI')) this.consumir('SEMI');
    for (const s of saltosFin) this.parchearSalto(s, this.bytecode.length);
  }

  private parsearExpresion(): void {
    this.parsearOr();
  }

  private parsearOr(): void {
    this.parsearXor();
    while (this.coincide('KEYWORD', 'OR')) {
      this.consumir('KEYWORD', 'OR');
      this.parsearXor();
      this.emitir('OR');
    }
  }

  private parsearXor(): void {
    this.parsearAnd();
    while (this.coincide('KEYWORD', 'XOR')) {
      this.consumir('KEYWORD', 'XOR');
      this.parsearAnd();
      this.emitir('XOR');
    }
  }

  private parsearAnd(): void {
    this.parsearComparacion();
    while (this.coincide('KEYWORD', 'AND')) {
      this.consumir('KEYWORD', 'AND');
      this.parsearComparacion();
      this.emitir('AND');
    }
  }

  private parsearComparacion(): void {
    this.parsearSuma();
    while (
      this.coincide('EQ') ||
      this.coincide('NEQ') ||
      this.coincide('LT') ||
      this.coincide('LTE') ||
      this.coincide('GT') ||
      this.coincide('GTE')
    ) {
      const opTok = this.actual();
      this.pos++;
      this.parsearSuma();
      const map: Record<string, OpcodeST> = {
        EQ: 'EQ',
        NEQ: 'NEQ',
        LT: 'LT',
        LTE: 'LTE',
        GT: 'GT',
        GTE: 'GTE',
      };
      this.emitir(map[opTok.tipo]);
    }
  }

  private parsearSuma(): void {
    this.parsearProducto();
    while (this.coincide('PLUS') || this.coincide('MINUS')) {
      const op = this.actual().tipo;
      this.pos++;
      this.parsearProducto();
      this.emitir(op === 'PLUS' ? 'ADD' : 'SUB');
    }
  }

  private parsearProducto(): void {
    this.parsearUnario();
    while (
      this.coincide('MUL') ||
      this.coincide('DIV') ||
      this.coincide('KEYWORD', 'MOD')
    ) {
      const t = this.actual();
      this.pos++;
      this.parsearUnario();
      if (t.tipo === 'MUL') this.emitir('MUL');
      else if (t.tipo === 'DIV') this.emitir('DIV');
      else this.emitir('MOD');
    }
  }

  private parsearUnario(): void {
    if (this.coincide('MINUS')) {
      this.consumir('MINUS');
      this.parsearUnario();
      this.emitir('NEG');
      return;
    }
    if (this.coincide('KEYWORD', 'NOT')) {
      this.consumir('KEYWORD', 'NOT');
      this.parsearUnario();
      this.emitir('NOT');
      return;
    }
    this.parsearPrimario();
  }

  private parsearPrimario(): void {
    const t = this.actual();
    if (t.tipo === 'NUMBER') {
      this.pos++;
      this.emitir('PUSH_CONST', Number(t.lexema));
      return;
    }
    if (t.tipo === 'BOOL') {
      this.pos++;
      this.emitir('PUSH_CONST', t.lexema === 'TRUE');
      return;
    }
    if (t.tipo === 'STRING') {
      this.pos++;
      this.emitir('PUSH_CONST', t.lexema);
      return;
    }
    if (t.tipo === 'IDENT') {
      this.pos++;
      this.emitir('LOAD_VAR', t.lexema);
      return;
    }
    if (t.tipo === 'LPAREN') {
      this.consumir('LPAREN');
      this.parsearExpresion();
      this.consumir('RPAREN');
      return;
    }
    throw new Error(
      `Expresión inesperada '${t.lexema || 'EOF'}' en línea ${t.linea}:${t.columna}`
    );
  }
}

/**
 * Compila un programa IEC 61131-3 Structured Text a bytecode ejecutable.
 */
export function compilarStructuredText(codigoFuente: string): ProgramaCompiladoST {
  try {
    const tokens = tokenizarStructuredText(codigoFuente);
    const parser = new ParserCompiladorST(tokens);
    parser.compilar();
    return {
      exito: true,
      errores: [],
      variables: parser.variables,
      bytecode: parser.bytecode,
    };
  } catch (err: unknown) {
    return {
      exito: false,
      errores: [err instanceof Error ? err.message : 'Error de compilación ST'],
      variables: [],
      bytecode: [],
    };
  }
}

/**
 * Máquina virtual determinista de pila para ejecutar un programa ST compilado en un scan cycle.
 */
export function ejecutarBytecodeST(
  programa: ProgramaCompiladoST,
  entradasExternas: Record<string, ValorST> = {},
  memoriaPrevia?: Record<string, ValorST>,
  maxInstrucciones = 10000
): ResultadoEjecucionST {
  if (!programa.exito) {
    return {
      memoria: { ...memoriaPrevia },
      instruccionesEjecutadas: 0,
      error: programa.errores[0] ?? 'Programa no compilado',
    };
  }

  const memoria: Record<string, ValorST> = {};
  for (const v of programa.variables) {
    memoria[v.nombre] = memoriaPrevia?.[v.nombre] ?? v.valorInicial;
  }
  for (const [k, v] of Object.entries(entradasExternas)) {
    memoria[k] = v;
  }

  const pila: ValorST[] = [];
  let pc = 0;
  let pasos = 0;
  const code = programa.bytecode;

  while (pc < code.length) {
    if (pasos++ >= maxInstrucciones) {
      return {
        memoria,
        instruccionesEjecutadas: pasos,
        error: `Límite de seguridad de ciclo excedido (${maxInstrucciones} instrucciones)`,
      };
    }

    const inst = code[pc++];
    switch (inst.op) {
      case 'PUSH_CONST':
        pila.push(inst.arg ?? 0);
        break;
      case 'LOAD_VAR': {
        const nombre = String(inst.arg ?? '');
        pila.push(memoria[nombre] ?? 0);
        break;
      }
      case 'STORE_VAR': {
        const nombre = String(inst.arg ?? '');
        memoria[nombre] = pila.pop() ?? 0;
        break;
      }
      case 'ADD': {
        const b = pila.pop() ?? 0;
        const a = pila.pop() ?? 0;
        pila.push(Number(a) + Number(b));
        break;
      }
      case 'SUB': {
        const b = Number(pila.pop() ?? 0);
        const a = Number(pila.pop() ?? 0);
        pila.push(a - b);
        break;
      }
      case 'MUL': {
        const b = Number(pila.pop() ?? 0);
        const a = Number(pila.pop() ?? 0);
        pila.push(a * b);
        break;
      }
      case 'DIV': {
        const b = Number(pila.pop() ?? 0);
        const a = Number(pila.pop() ?? 0);
        pila.push(b === 0 ? 0 : a / b);
        break;
      }
      case 'MOD': {
        const b = Number(pila.pop() ?? 0);
        const a = Number(pila.pop() ?? 0);
        pila.push(b === 0 ? 0 : a % b);
        break;
      }
      case 'NEG':
        pila.push(-Number(pila.pop() ?? 0));
        break;
      case 'NOT':
        pila.push(!Boolean(pila.pop()));
        break;
      case 'AND': {
        const b = Boolean(pila.pop());
        const a = Boolean(pila.pop());
        pila.push(a && b);
        break;
      }
      case 'OR': {
        const b = Boolean(pila.pop());
        const a = Boolean(pila.pop());
        pila.push(a || b);
        break;
      }
      case 'XOR': {
        const b = Boolean(pila.pop());
        const a = Boolean(pila.pop());
        pila.push(a !== b);
        break;
      }
      case 'EQ': {
        const b = pila.pop();
        const a = pila.pop();
        pila.push(a === b);
        break;
      }
      case 'NEQ': {
        const b = pila.pop();
        const a = pila.pop();
        pila.push(a !== b);
        break;
      }
      case 'LT': {
        const b = Number(pila.pop() ?? 0);
        const a = Number(pila.pop() ?? 0);
        pila.push(a < b);
        break;
      }
      case 'LTE': {
        const b = Number(pila.pop() ?? 0);
        const a = Number(pila.pop() ?? 0);
        pila.push(a <= b);
        break;
      }
      case 'GT': {
        const b = Number(pila.pop() ?? 0);
        const a = Number(pila.pop() ?? 0);
        pila.push(a > b);
        break;
      }
      case 'GTE': {
        const b = Number(pila.pop() ?? 0);
        const a = Number(pila.pop() ?? 0);
        pila.push(a >= b);
        break;
      }
      case 'JMP':
        pc = Number(inst.arg ?? 0);
        break;
      case 'JMP_IF_FALSE': {
        const cond = Boolean(pila.pop());
        if (!cond) pc = Number(inst.arg ?? 0);
        break;
      }
      case 'DUP':
        pila.push(pila[pila.length - 1] ?? 0);
        break;
      case 'POP':
        pila.pop();
        break;
      case 'HALT':
        return { memoria, instruccionesEjecutadas: pasos };
    }
  }

  return { memoria, instruccionesEjecutadas: pasos };
}

export const EJEMPLO_ST_PLANTA = `
VAR_INPUT
  NIVEL_TNQ : REAL := 52.0;
  APAGON : BOOL := FALSE;
  AIRE_OK : BOOL := TRUE;
END_VAR
VAR
  i : INT := 0;
  promedio : REAL := 0.0;
END_VAR
VAR_OUTPUT
  VALVULA_FC : BOOL := TRUE;
  ALARMA_ALTA : BOOL := FALSE;
END_VAR

IF APAGON OR NOT AIRE_OK THEN
  VALVULA_FC := FALSE;
  ALARMA_ALTA := TRUE;
ELSIF NIVEL_TNQ > 85.0 THEN
  VALVULA_FC := FALSE;
  ALARMA_ALTA := TRUE;
ELSE
  VALVULA_FC := TRUE;
  ALARMA_ALTA := FALSE;
END_IF;

FOR i := 1 TO 4 BY 1 DO
  promedio := promedio + NIVEL_TNQ / 4.0;
END_FOR;
`;
