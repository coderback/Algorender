// The C++ driver: one file, main.cpp, with TreeNode and ListNode, then the
// learner's code (under #line 1 "solution.cpp", so compile errors point at
// their lines), then the reader, a JSON writer and main(). A crash (a bad
// pointer, deep recursion, division by zero) is caught by a signal handler
// on its own stack, which writes the test's error line before exiting.

import { CPP } from '../codegen';
import type { DesignSig, FunctionSig, Param, ValueType } from '../schema';
import { READER, type Program } from './shared';

const PRELUDE = String.raw`#include <bits/stdc++.h>
#include <csignal>
#include <unistd.h>
using namespace std;

struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};

`;

const RUNTIME = String.raw`
#line 1 "driver.cpp"
namespace judge {
string in;
size_t pos = 0;
FILE *answers;

void ws() { while (pos < in.size() && (unsigned char)in[pos] <= ' ') pos++; }
string tok() { ws(); size_t s = pos; while (pos < in.size() && (unsigned char)in[pos] > ' ') pos++; return in.substr(s, pos - s); }
int rInt() { return (int)stoll(tok()); }
long long rLong() { return stoll(tok()); }
double rFloat() { return strtod(tok().c_str(), nullptr); }
bool rBool() { return tok() == "true"; }
string rString() {
    ws(); size_t s = pos; while (in[pos] != ':') pos++;
    size_t n = stoul(in.substr(s, pos - s)); pos++;
    string r = in.substr(pos, n); pos += n; return r;
}
vector<int> rIntArr() { int n = rInt(); vector<int> a(n); for (auto &x : a) x = rInt(); return a; }
vector<double> rFloatArr() { int n = rInt(); vector<double> a(n); for (auto &x : a) x = rFloat(); return a; }
vector<bool> rBoolArr() { int n = rInt(); vector<bool> a(n); for (int i = 0; i < n; i++) a[i] = rBool(); return a; }
vector<string> rStringArr() { int n = rInt(); vector<string> a(n); for (auto &x : a) x = rString(); return a; }
vector<vector<int>> rIntArr2() { int n = rInt(); vector<vector<int>> a(n); for (auto &x : a) x = rIntArr(); return a; }
vector<vector<double>> rFloatArr2() { int n = rInt(); vector<vector<double>> a(n); for (auto &x : a) x = rFloatArr(); return a; }
vector<vector<string>> rStringArr2() { int n = rInt(); vector<vector<string>> a(n); for (auto &x : a) x = rStringArr(); return a; }
ListNode *rList() { vector<int> a = rIntArr(); ListNode *head = nullptr; for (int i = (int)a.size() - 1; i >= 0; i--) head = new ListNode(a[i], head); return head; }
TreeNode *rTree() {
    int n = rInt(); vector<optional<int>> v(n);
    for (auto &x : v) { string t = tok(); if (t != "null") x = (int)stoll(t); }
    if (n == 0 || !v[0]) return nullptr;
    TreeNode *root = new TreeNode(*v[0]);
    vector<TreeNode *> waiting{root};
    int i = 1;
    for (size_t k = 0; i < n && k < waiting.size(); k++) {
        TreeNode *node = waiting[k];
        if (i < n && v[i]) { node->left = new TreeNode(*v[i]); waiting.push_back(node->left); }
        i++;
        if (i < n && v[i]) { node->right = new TreeNode(*v[i]); waiting.push_back(node->right); }
        i++;
    }
    return root;
}

void str(string &b, const string &s) {
    b += '"';
    for (unsigned char c : s) {
        if (c == '"' || c == '\\') { b += '\\'; b += (char)c; }
        else if (c == '\n') b += "\\n";
        else if (c < 0x20) { char u[8]; snprintf(u, sizeof u, "\\u%04x", c); b += u; }
        else b += (char)c;
    }
    b += '"';
}

void w(string &b, int v);
void w(string &b, long v);
void w(string &b, long long v);
void w(string &b, unsigned v);
void w(string &b, unsigned long v);
void w(string &b, unsigned long long v);
void w(string &b, double v);
void w(string &b, float v);
void w(string &b, bool v);
void w(string &b, char v);
void w(string &b, const string &v);
void w(string &b, const char *v);
void w(string &b, TreeNode *v);
void w(string &b, ListNode *v);
void w(string &b, const vector<bool> &v);
template <class T> void w(string &b, const vector<T> &v);
template <class T> void w(string &b, const set<T> &v);
template <class T> void w(string &b, const unordered_set<T> &v);
template <class T> void w(string &b, const deque<T> &v);
template <class A, class B> void w(string &b, const pair<A, B> &v);

void w(string &b, int v) { b += to_string(v); }
void w(string &b, long v) { b += to_string(v); }
void w(string &b, long long v) { b += to_string(v); }
void w(string &b, unsigned v) { b += to_string(v); }
void w(string &b, unsigned long v) { b += to_string(v); }
void w(string &b, unsigned long long v) { b += to_string(v); }
void w(string &b, double v) {
    if (isnan(v)) { str(b, "NaN"); return; }
    if (isinf(v)) { str(b, v > 0 ? "Infinity" : "-Infinity"); return; }
    if (v == 0) { b += '0'; return; }
    char buf[40];
    auto r = to_chars(buf, buf + sizeof buf, v);
    b.append(buf, r.ptr);
}
void w(string &b, float v) { w(b, (double)v); }
void w(string &b, bool v) { b += v ? "true" : "false"; }
void w(string &b, char v) { str(b, string(1, v)); }
void w(string &b, const string &v) { str(b, v); }
void w(string &b, const char *v) { str(b, v); }
void w(string &b, ListNode *head) {
    string items = "[";
    unordered_set<ListNode *> seen;
    for (ListNode *node = head; node; node = node->next) {
        if (seen.count(node)) { str(b, "not a list: it loops back to a node it already passed"); return; }
        if (seen.size() >= 1000000) { str(b, "not a list: longer than 1,000,000 nodes"); return; }
        seen.insert(node);
        if (items.size() > 1) items += ',';
        items += to_string(node->val);
    }
    b += items + "]";
}
void w(string &b, TreeNode *root) {
    vector<TreeNode *> waiting{root};
    unordered_set<TreeNode *> seen;
    vector<string> items;
    for (size_t k = 0; k < waiting.size(); k++) {
        TreeNode *node = waiting[k];
        if (!node) { items.push_back("null"); continue; }
        if (seen.count(node) || seen.size() >= 10000) { str(b, "not a tree: a node can be reached twice"); return; }
        seen.insert(node);
        items.push_back(to_string(node->val));
        waiting.push_back(node->left);
        waiting.push_back(node->right);
    }
    while (!items.empty() && items.back() == "null") items.pop_back();
    b += '[';
    for (size_t i = 0; i < items.size(); i++) { if (i) b += ','; b += items[i]; }
    b += ']';
}
template <class C> void items(string &b, const C &v) {
    b += '[';
    bool first = true;
    for (const auto &x : v) { if (!first) b += ','; first = false; w(b, x); }
    b += ']';
}
void w(string &b, const vector<bool> &v) {
    b += '[';
    for (size_t i = 0; i < v.size(); i++) { if (i) b += ','; w(b, (bool)v[i]); }
    b += ']';
}
template <class T> void w(string &b, const vector<T> &v) { items(b, v); }
template <class T> void w(string &b, const set<T> &v) { items(b, v); }
template <class T> void w(string &b, const unordered_set<T> &v) { items(b, v); }
template <class T> void w(string &b, const deque<T> &v) { items(b, v); }
template <class A, class B> void w(string &b, const pair<A, B> &v) { b += '['; w(b, v.first); b += ','; w(b, v.second); b += ']'; }

template <class T> string json(const T &v) { string b; w(b, v); return b; }

char crash[64];
size_t crashLength = 0;

void onSignal(int sig) {
    const char *why = sig == SIGSEGV || sig == SIGBUS
        ? "Segmentation fault: the code touched memory it doesn't own (an index past the end, a null pointer, or recursion too deep)"
        : sig == SIGFPE ? "Arithmetic error: division by zero?"
        : "Aborted: an exception escaped, or a check failed";
    int fd = fileno(answers);
    if (write(fd, crash, crashLength) < 0 || write(fd, why, strlen(why)) < 0 || write(fd, "\"}\n", 3) < 0) {}
    _exit(1);
}

using Clock = chrono::steady_clock;
double since(Clock::time_point start) { return chrono::duration<double, milli>(Clock::now() - start).count(); }

void answer(int t, double ms, const string *value, const string *error) {
    string b = "{\"i\":" + to_string(t) + ",\"ms\":" + to_string(ms);
    if (value) b += ",\"v\":" + *value;
    if (error) { b += ",\"e\":"; str(b, *error); }
    b += "}\n";
    fwrite(b.data(), 1, b.size(), answers);
    fflush(answers);
}

template <class F> void guarded(int t, Clock::time_point start, string &value, F run) {
    try {
        run();
        answer(t, since(start), &value, nullptr);
    } catch (const exception &e) {
        string m = string("Exception: ") + e.what();
        answer(t, since(start), nullptr, &m);
    } catch (...) {
        string m = "An exception was thrown";
        answer(t, since(start), nullptr, &m);
    }
}

void test(int t);
}  // namespace judge

int main(int argc, char **argv) {
    judge::in.assign(istreambuf_iterator<char>(cin), istreambuf_iterator<char>());
    judge::answers = fopen(argv[1], "w");
    static char altStack[1 << 16];
    stack_t ss{};
    ss.ss_sp = altStack;
    ss.ss_size = sizeof altStack;
    sigaltstack(&ss, nullptr);
    struct sigaction sa{};
    sa.sa_handler = judge::onSignal;
    sa.sa_flags = SA_ONSTACK;
    for (int sig : {SIGSEGV, SIGBUS, SIGFPE, SIGABRT}) sigaction(sig, &sa, nullptr);
    int n = judge::rInt();
    for (int t = 0; t < n; t++) {
        cout << flush;
        fflush(stdout);
        cout << "\x1e" "ALGORENDER-TEST " << t << "\n" << flush;
        judge::crashLength = snprintf(judge::crash, sizeof judge::crash, "{\"i\":%d,\"x\":1,\"e\":\"", t);
        judge::test(t);
    }
    cout << flush;
    fclose(judge::answers);
    return 0;
}

`;

/** Reads a test's arguments into a0, a1, … (C++ evaluates declarations in order). */
const readArgs = (params: Param[], prefix: string) => params.map((p, i) => `${CPP[p.type]} ${prefix}${i} = ${read(p.type)};`).join(' ');
const read = (t: ValueType) => `${READER[t]}()`;

function functionTest(sig: FunctionSig): string {
  const args = sig.params.map((_, i) => `a${i}`).join(', ');
  const call = `(new Solution())->${sig.function}(${args})`;
  const inPlace = sig.params.findIndex((p) => p.name === sig.inPlace);
  const run = sig.returns === 'void' ? `${call}; value = json(a${inPlace});` : `auto r = ${call}; value = json(r);`;
  return `void judge::test(int t) {
    ${readArgs(sig.params, 'a')}
    string value;
    auto start = Clock::now();
    guarded(t, start, value, [&]() { ${run} });
}
`;
}

function designTest(d: DesignSig): string {
  const names = (params: Param[]) => params.map((_, i) => `x${i}`);
  const captures = (params: Param[]) => ['&obj', '&results', ...names(params)].join(', ');
  const cases = [
    `        case 0: { ${readArgs(d.init, 'x')} calls.push_back([${captures(d.init)}]() mutable { obj = new ${d.class}(${names(d.init).join(', ')}); results.push_back("null"); }); break; }`,
    ...d.methods.map((m, k) => {
      const call = `obj->${m.name}(${names(m.params).join(', ')})`;
      const run = m.returns === 'void' ? `${call}; results.push_back("null");` : `results.push_back(json(${call}));`;
      return `        case ${k + 1}: { ${readArgs(m.params, 'x')} calls.push_back([${captures(m.params)}]() mutable { ${run} }); break; }`;
    }),
  ];
  return `void judge::test(int t) {
    int n = rInt();
    ${d.class} *obj = nullptr;
    vector<string> results;
    vector<function<void()>> calls;
    for (int k = 0; k < n; k++) {
        switch (rInt()) {
${cases.join('\n')}
        }
    }
    auto start = Clock::now();
    auto list = [&]() { string b = "["; for (size_t i = 0; i < results.size(); i++) { if (i) b += ','; b += results[i]; } return b + "]"; };
    try {
        for (auto &c : calls) c();
        string value = list();
        answer(t, since(start), &value, nullptr);
    } catch (const exception &e) {
        string value = list(), m = string("Exception: ") + e.what();
        answer(t, since(start), &value, &m);
    } catch (...) {
        string value = list(), m = "An exception was thrown";
        answer(t, since(start), &value, &m);
    }
}
`;
}

export function cppProgram(shape: { signature?: FunctionSig; design?: DesignSig }, code: string): Program {
  const test = shape.signature ? functionTest(shape.signature) : designTest(shape.design!);
  const main = `${PRELUDE}#line 1 "solution.cpp"\n${code}\n${RUNTIME}#line 1 "test.cpp"\n${test}`;
  return { source: 'solution.cpp', files: { 'main.cpp': main } };
}
