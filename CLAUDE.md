# Sistema Barbería — Backend

La documentación del proyecto está en el `CLAUDE.md` de la raíz (`../CLAUDE.md`), que cubre backend y frontend juntos.

Antes existía acá una copia completa del mismo texto; se eliminó porque quedó desactualizada respecto de la raíz y desinformaba. No volver a duplicarla: si hay que documentar algo del backend, va en el doc raíz.

**Lo mínimo para no equivocarse:**

- Esto es para **una sola barbería**, no es un SaaS multi-tenant. El código multi-tenant (`tenantMiddleware`, subdominios) es herencia de antes y está puenteado por `SINGLE_TENANT_ID`.
- El backend **no tiene script `dev`**: se arranca con `npm start`.
