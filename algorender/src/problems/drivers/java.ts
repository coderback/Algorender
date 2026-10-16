// The Java driver: Main.java reads the tests (encode.ts), calls the learner's
// Solution (or design class) once per test in a thread with a deep stack,
// times each call, and writes one JSON line per test to the answers file.
// The learner's file gets common imports on its first line, so line numbers
// in errors still match the editor.

import { JAVA } from '../codegen';
import type { DesignSig, FunctionSig, Param, ValueType } from '../schema';
import { READER, type Program } from './shared';

const IMPORTS = 'import java.util.*; import java.util.function.*; import java.util.stream.*; import java.math.*; ';

const RUNTIME = String.raw`import java.io.*;
import java.lang.reflect.Array;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class Main {
    static byte[] in;
    static int pos;
    static PrintStream out;
    static OutputStream answers;

    static void ws() { while (pos < in.length && in[pos] <= ' ') pos++; }
    static String tok() { ws(); int s = pos; while (pos < in.length && in[pos] > ' ') pos++; return new String(in, s, pos - s, StandardCharsets.UTF_8); }
    static int rInt() { return Integer.parseInt(tok()); }
    static long rLong() { return Long.parseLong(tok()); }
    static double rFloat() { return Double.parseDouble(tok()); }
    static boolean rBool() { return tok().equals("true"); }
    static String rString() {
        ws(); int s = pos; while (in[pos] != ':') pos++;
        int n = Integer.parseInt(new String(in, s, pos - s, StandardCharsets.UTF_8)); pos++;
        String r = new String(in, pos, n, StandardCharsets.UTF_8); pos += n; return r;
    }
    static int[] rIntArr() { int n = rInt(); int[] a = new int[n]; for (int i = 0; i < n; i++) a[i] = rInt(); return a; }
    static double[] rFloatArr() { int n = rInt(); double[] a = new double[n]; for (int i = 0; i < n; i++) a[i] = rFloat(); return a; }
    static boolean[] rBoolArr() { int n = rInt(); boolean[] a = new boolean[n]; for (int i = 0; i < n; i++) a[i] = rBool(); return a; }
    static String[] rStringArr() { int n = rInt(); String[] a = new String[n]; for (int i = 0; i < n; i++) a[i] = rString(); return a; }
    static int[][] rIntArr2() { int n = rInt(); int[][] a = new int[n][]; for (int i = 0; i < n; i++) a[i] = rIntArr(); return a; }
    static double[][] rFloatArr2() { int n = rInt(); double[][] a = new double[n][]; for (int i = 0; i < n; i++) a[i] = rFloatArr(); return a; }
    static String[][] rStringArr2() { int n = rInt(); String[][] a = new String[n][]; for (int i = 0; i < n; i++) a[i] = rStringArr(); return a; }
    static ListNode rList() { int[] a = rIntArr(); ListNode head = null; for (int i = a.length - 1; i >= 0; i--) head = new ListNode(a[i], head); return head; }
    static TreeNode rTree() {
        int n = rInt(); Integer[] v = new Integer[n];
        for (int i = 0; i < n; i++) { String t = tok(); v[i] = t.equals("null") ? null : Integer.valueOf(t); }
        if (n == 0 || v[0] == null) return null;
        TreeNode root = new TreeNode(v[0]);
        ArrayList<TreeNode> waiting = new ArrayList<>(); waiting.add(root);
        int i = 1;
        for (int k = 0; i < n && k < waiting.size(); k++) {
            TreeNode node = waiting.get(k);
            if (i < n && v[i] != null) { node.left = new TreeNode(v[i]); waiting.add(node.left); }
            i++;
            if (i < n && v[i] != null) { node.right = new TreeNode(v[i]); waiting.add(node.right); }
            i++;
        }
        return root;
    }

    static void str(StringBuilder b, String s) {
        b.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c == '\n') b.append("\\n");
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        b.append('"');
    }

    static void json(StringBuilder b, Object v) {
        if (v == null) { b.append("null"); return; }
        if (v instanceof Integer || v instanceof Long || v instanceof Short || v instanceof Byte) { b.append(v); return; }
        if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            if (Double.isNaN(d)) str(b, "NaN");
            else if (Double.isInfinite(d)) str(b, d > 0 ? "Infinity" : "-Infinity");
            else if (d == Math.rint(d) && Math.abs(d) < 1e15) b.append((long) d);
            else b.append(d);
            return;
        }
        if (v instanceof Boolean) { b.append(v); return; }
        if (v instanceof Character || v instanceof CharSequence) { str(b, v.toString()); return; }
        if (v instanceof TreeNode) { tree(b, (TreeNode) v); return; }
        if (v instanceof ListNode) { list(b, (ListNode) v); return; }
        if (v instanceof Map) {
            b.append('['); boolean first = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) {
                if (!first) b.append(','); first = false;
                b.append('['); json(b, e.getKey()); b.append(','); json(b, e.getValue()); b.append(']');
            }
            b.append(']'); return;
        }
        if (v instanceof Iterable) {
            b.append('['); boolean first = true;
            for (Object x : (Iterable<?>) v) { if (!first) b.append(','); first = false; json(b, x); }
            b.append(']'); return;
        }
        if (v.getClass().isArray()) {
            int n = Array.getLength(v);
            b.append('[');
            for (int i = 0; i < n; i++) { if (i > 0) b.append(','); json(b, Array.get(v, i)); }
            b.append(']'); return;
        }
        str(b, v.toString());
    }

    static void list(StringBuilder b, ListNode head) {
        StringBuilder items = new StringBuilder("[");
        Set<ListNode> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (ListNode node = head; node != null; node = node.next) {
            if (seen.contains(node)) { str(b, "not a list: it loops back to a node it already passed"); return; }
            if (seen.size() >= 1_000_000) { str(b, "not a list: longer than 1,000,000 nodes"); return; }
            seen.add(node);
            if (items.length() > 1) items.append(',');
            items.append(node.val);
        }
        b.append(items).append(']');
    }

    static void tree(StringBuilder b, TreeNode root) {
        ArrayList<TreeNode> waiting = new ArrayList<>(); waiting.add(root);
        Set<TreeNode> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        ArrayList<String> items = new ArrayList<>();
        for (int k = 0; k < waiting.size(); k++) {
            TreeNode node = waiting.get(k);
            if (node == null) { items.add("null"); continue; }
            if (seen.contains(node) || seen.size() >= 10_000) { str(b, "not a tree: a node can be reached twice"); return; }
            seen.add(node);
            items.add(String.valueOf(node.val));
            waiting.add(node.left); waiting.add(node.right);
        }
        while (!items.isEmpty() && items.get(items.size() - 1).equals("null")) items.remove(items.size() - 1);
        b.append('[').append(String.join(",", items)).append(']');
    }

    static String describe(Throwable e) {
        if (e instanceof StackOverflowError) return "StackOverflowError: the recursion went too deep (does it always reach a base case?)";
        if (e instanceof OutOfMemoryError) return "OutOfMemoryError: the program ran out of memory";
        String m = e.getMessage();
        return m == null ? e.getClass().getSimpleName() : e.getClass().getSimpleName() + ": " + m;
    }

    static int lineOf(Throwable e) {
        for (StackTraceElement f : e.getStackTrace()) if (SOURCE.equals(f.getFileName())) return f.getLineNumber();
        return -1;
    }

    static void answer(int t, long start, Object value, boolean hasValue, Throwable error) throws IOException {
        double ms = (System.nanoTime() - start) / 1e6;
        StringBuilder b = new StringBuilder("{\"i\":").append(t).append(",\"ms\":").append(ms);
        if (hasValue) { b.append(",\"v\":"); json(b, value); }
        if (error != null) {
            b.append(",\"e\":"); str(b, describe(error));
            int line = lineOf(error);
            if (line > 0) b.append(",\"l\":").append(line);
        }
        b.append("}\n");
        answers.write(b.toString().getBytes(StandardCharsets.UTF_8));
        answers.flush();
    }

    public static void main(String[] args) throws Exception {
        in = System.in.readAllBytes();
        answers = new BufferedOutputStream(new FileOutputStream(args[0]));
        out = new PrintStream(new BufferedOutputStream(new FileOutputStream(FileDescriptor.out), 1 << 16), false, StandardCharsets.UTF_8);
        System.setOut(out);
        Thread worker = new Thread(null, () -> {
            try {
                int n = rInt();
                for (int t = 0; t < n; t++) {
                    out.flush();
                    out.print("\u001eALGORENDER-TEST " + t + "\n");
                    out.flush();
                    test(t);
                }
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }, "judge", 1L << 26);
        worker.start();
        worker.join();
        out.flush();
        answers.flush();
        System.exit(0);
    }
`;

const NODES = {
  'TreeNode.java':
    'public class TreeNode {\n    public int val;\n    public TreeNode left, right;\n    public TreeNode() {}\n    public TreeNode(int val) { this.val = val; }\n    public TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }\n}\n',
  'ListNode.java':
    'public class ListNode {\n    public int val;\n    public ListNode next;\n    public ListNode() {}\n    public ListNode(int val) { this.val = val; }\n    public ListNode(int val, ListNode next) { this.val = val; this.next = next; }\n}\n',
};

const read = (t: ValueType) => `${READER[t]}()`;

/** Reads a test's arguments into a0, a1, … */
const readArgs = (params: Param[], prefix: string) => params.map((p, i) => `final ${JAVA[p.type]} ${prefix}${i} = ${read(p.type)};`).join(' ');

function functionTest(sig: FunctionSig): string {
  const args = sig.params.map((_, i) => `a${i}`).join(', ');
  const call = `new Solution().${sig.function}(${args})`;
  const inPlace = sig.params.findIndex((p) => p.name === sig.inPlace);
  const body =
    sig.returns === 'void'
      ? `${call}; answer(t, start, a${inPlace}, true, null);`
      : `Object r = ${call}; answer(t, start, r, true, null);`;
  return `    static void test(int t) throws IOException {
        ${readArgs(sig.params, 'a')}
        long start = System.nanoTime();
        try { ${body} } catch (Throwable e) { answer(t, start, null, false, e); }
    }
`;
}

function designTest(d: DesignSig): string {
  const cases = [
    `            case 0: { ${readArgs(d.init, 'x')} calls.add(() -> { obj[0] = new ${d.class}(${d.init.map((_, i) => `x${i}`).join(', ')}); results.add(null); }); break; }`,
    ...d.methods.map((m, k) => {
      const call = `obj[0].${m.name}(${m.params.map((_, i) => `x${i}`).join(', ')})`;
      const run = m.returns === 'void' ? `${call}; results.add(null);` : `results.add(${call});`;
      return `            case ${k + 1}: { ${readArgs(m.params, 'x')} calls.add(() -> { ${run} }); break; }`;
    }),
  ];
  return `    static void test(int t) throws IOException {
        int n = rInt();
        final ${d.class}[] obj = new ${d.class}[1];
        final ArrayList<Object> results = new ArrayList<>();
        ArrayList<Runnable> calls = new ArrayList<>();
        for (int k = 0; k < n; k++) {
            switch (rInt()) {
${cases.join('\n')}
            }
        }
        long start = System.nanoTime();
        try { for (Runnable c : calls) c.run(); answer(t, start, results, true, null); } catch (Throwable e) { answer(t, start, results, true, e); }
    }
`;
}

export function javaProgram(shape: { signature?: FunctionSig; design?: DesignSig }, code: string): Program {
  const source = shape.design ? `${shape.design.class}.java` : 'Solution.java';
  const main = `${RUNTIME}    static final String SOURCE = "${source}";\n\n${shape.signature ? functionTest(shape.signature) : designTest(shape.design!)}}\n`;
  return {
    source,
    files: { 'Main.java': main, ...NODES, [source]: IMPORTS + code },
  };
}
