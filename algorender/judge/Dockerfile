# The local server judge: Java, C++ and Go toolchains for running learners'
# code in a container with no network (src/server/judge/docker.ts). Production
# uses Vercel Sandbox instead (scripts/judge-snapshot.mjs). Build it with
#   npm run judge:image
FROM alpine:3.22
RUN apk add --no-cache g++ openjdk21-jdk go \
 && printf 'package main\nimport ("container/heap"; "fmt"; "math"; "slices"; "sort"; "strconv"; "strings"; "bufio"; "os"; "runtime/debug"; "time")\nvar _ = []any{heap.Init, fmt.Sprint, math.Abs, slices.Sort[[]int], sort.Ints, strconv.Itoa, strings.Split, bufio.NewReader, os.Exit, debug.Stack, time.Now}\nfunc main() {}\n' > /tmp/warm.go \
 && cd /tmp && go build -o /tmp/warm warm.go && rm -f /tmp/warm /tmp/warm.go
ENV PATH="/usr/lib/jvm/default-jvm/bin:${PATH}"
WORKDIR /judge
