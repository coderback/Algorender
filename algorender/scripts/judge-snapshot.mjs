// Builds the Vercel Sandbox snapshot the server judge starts every run from:
// Ubuntu with g++, JDK 21 and Go, Go's build cache warmed, and a smoke test
// that compiles and runs a program in each language. Run it once (and again
// to upgrade a toolchain), then set the printed JUDGE_SNAPSHOT_ID in the
// project's environment variables. The snapshot never expires.
//
//   vercel env pull            # writes VERCEL_OIDC_TOKEN into .env.local
//   node --env-file=.env.local scripts/judge-snapshot.mjs
//
// or with VERCEL_TOKEN, VERCEL_TEAM_ID and VERCEL_PROJECT_ID set instead.

import { Sandbox } from '@vercel/sandbox';

/** Go from go.dev (Ubuntu's package lags behind), the same version as the local Docker image's. */
const GO = '1.24.13';

const { VERCEL_TOKEN: token, VERCEL_TEAM_ID: teamId, VERCEL_PROJECT_ID: projectId } = process.env;
const credentials = token && teamId && projectId ? { token, teamId, projectId } : {};

const sandbox = await Sandbox.create({ image: 'vercel/sandbox/ubuntu', resources: { vcpus: 2 }, timeout: 20 * 60_000, ...credentials });
console.log(`Sandbox ${sandbox.name} started.`);

async function run(script, { sudo = false } = {}) {
  console.log(`$ ${script}`);
  const result = await sandbox.runCommand({ cmd: 'sh', args: ['-c', script], sudo, env: { DEBIAN_FRONTEND: 'noninteractive' }, stdout: process.stdout, stderr: process.stderr });
  if (result.exitCode !== 0) throw new Error(`exit code ${result.exitCode}`);
}

try {
  await run('apt-get update -q && apt-get install -y -q --no-install-recommends g++ openjdk-21-jdk-headless curl ca-certificates', { sudo: true });
  await run(`curl -fsSL https://go.dev/dl/go${GO}.linux-amd64.tar.gz | tar -C /usr/local -xz && ln -sf /usr/local/go/bin/go /usr/local/bin/go && ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt`, { sudo: true });

  // Warm Go's build cache with every package the driver and the automatic imports use, so a run only compiles the learner's code.
  await sandbox.writeFiles([
    {
      path: 'warm/main.go',
      content:
        'package main\n\nimport (\n\t"container/heap"\n\t"fmt"\n\t"math"\n\t"os"\n\t"reflect"\n\t"regexp"\n\t"runtime/debug"\n\t"slices"\n\t"sort"\n\t"strconv"\n\t"strings"\n\t"time"\n)\n\nvar _ = []any{heap.Init, fmt.Sprint, math.Abs, os.Exit, reflect.ValueOf, regexp.MustCompile, debug.Stack, slices.Sort[[]int], sort.Ints, strconv.Itoa, strings.Split, time.Now}\n\nfunc main() { fmt.Println("go ok") }\n',
    },
    { path: 'warm/go.mod', content: 'module warm\n\ngo 1.22\n' },
    { path: 'warm/Hello.java', content: 'public class Hello { public static void main(String[] a) { System.out.println("java ok"); } }\n' },
    { path: 'warm/hello.cpp', content: '#include <bits/stdc++.h>\nint main() { std::cout << "c++ ok\\n"; }\n' },
  ]);
  await run('cd warm && GOTOOLCHAIN=local go build -o hello-go . && ./hello-go');
  await run('cd warm && javac -d out Hello.java && java -cp out Hello');
  await run('cd warm && g++ -std=c++20 -O2 -o hello-cpp hello.cpp && ./hello-cpp');
  await run('rm -rf warm && command -v timeout && g++ --version | head -1 && java -version 2>&1 | head -1 && go version');

  const snapshot = await sandbox.snapshot({ expiration: 0 });
  console.log(`\nJUDGE_SNAPSHOT_ID=${snapshot.snapshotId}`);
} catch (e) {
  await sandbox.stop().catch(() => {});
  console.error(e);
  process.exit(1);
}
