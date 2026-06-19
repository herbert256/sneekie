# Localized page source

The files in `html/` are the editable source for localized static pages.

They keep the English page body plus the `main-template-nl` and `main-template-uk`
authoring templates. Run this after editing them:

```sh
node tools/generate-locales.js
node tools/verify-i18n.js
```

The generator writes deployable, template-free pages to `docs/en/`,
`docs/nl/`, and `docs/uk/`.

Generated pages intentionally contain plain localized HTML text. Any `data-i18n*`
attributes in this source directory are generator hints only; they are stripped
from deployable pages so browser runtime i18n only covers shared chrome and
dynamic JavaScript text.
