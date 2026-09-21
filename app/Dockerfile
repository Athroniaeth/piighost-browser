FROM nginx:1.29-alpine

# La table MIME de nginx ne connaît pas .mjs : servi en octet-stream, et avec
# nosniff le navigateur refuse de l'exécuter comme module. Pyodide et le worker
# threadé d'ONNX Runtime sont tous deux des .mjs, donc le moteur ne démarrait
# pas. On étend la table plutôt que de la remplacer par un bloc `types`, qui
# lui masquerait tout le reste.
RUN sed -i 's|application/javascript  *js;|application/javascript                           js mjs;|' \
      /etc/nginx/mime.types \
 && grep -q 'js mjs;' /etc/nginx/mime.types

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/

# Pré-compresse ce qui compte : le modèle passe de 83 à 59 Mo, et nginx le sert
# tel quel grâce à gzip_static.
RUN find /usr/share/nginx/html -type f \
      \( -name '*.onnx' -o -name '*.json' -o -name '*.wasm' -o -name '*.js' -o -name '*.mjs' -o -name '*.css' \) \
      -size +1k -exec gzip -9 -k {} \;
