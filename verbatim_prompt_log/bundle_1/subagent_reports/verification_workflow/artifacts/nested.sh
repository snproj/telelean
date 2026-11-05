# the fixed part of comparator's own sandbox (Lake 5.0.0 src/lean/lake/Lake/CLI/Check.lean buildSandboxArgs)
bwrap --ro-bind / / --tmpfs /home --tmpfs /root --tmpfs /run/user --tmpfs /tmp --dir /tmp/home \
      --dev /dev --proc /proc --clearenv --setenv HOME /tmp/home --unshare-all --die-with-parent --new-session \
      --chdir / -- /usr/bin/echo "nested comparator-style sandbox ok"
echo "nested exit=$?"
