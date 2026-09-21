FROM nginx:1.29-alpine

# nginx's MIME table does not know .mjs: served as octet-stream, and with
# nosniff the browser refuses to execute it as a module. Pyodide and ONNX
# Runtime's threaded worker are both .mjs, so the engine never started. The
# table is extended rather than replaced by a `types` block, which would hide
# everything else.
RUN sed -i 's|application/javascript  *js;|application/javascript                           js mjs;|' \
      /etc/nginx/mime.types \
 && grep -q 'js mjs;' /etc/nginx/mime.types

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/

# Pre-compress what matters. nginx then serves it as-is through gzip_static.
RUN find /usr/share/nginx/html -type f \
      \( -name '*.onnx' -o -name '*.json' -o -name '*.wasm' -o -name '*.js' -o -name '*.mjs' -o -name '*.css' \) \
      -size +1k -exec gzip -9 -k {} \;
