# Official and primary sources

Research date: **2026-07-25**. Rules and API capabilities can change; verify again before implementation or tax-year release.

## AI platform documentation

- OpenAI — Web search tool: https://developers.openai.com/api/docs/guides/tools-web-search
- OpenAI — File search tool: https://developers.openai.com/api/docs/guides/tools-file-search
- OpenAI — Function calling/tool calling: https://developers.openai.com/api/docs/guides/function-calling

Architectural use:

- Web search can provide current information and sourced citations.
- File search can retrieve relevant information from uploaded knowledge bases.
- Function calling allows the model to request typed application data/actions.

The implementation should remain provider-abstracted and should not give the model unrestricted database access.

## Sweden

- Skatteverket — Cryptocurrencies: https://www.skatteverket.se/privat/skatter/vardepapper/andratillgangar/kryptovalutor.4.15532c7b1442f256bae11b60.html
- Skatteverket — Liability for taxation: https://www.skatteverket.se/servicelankar/otherlanguages/inenglishengelska/individualsandemployees/newinswedenandwillbeemployedhere/liabilityfortaxation.4.676f4884175c97df41930a7.html
- Skatteverket — Declaring foreign income/tax return guidance: https://www.skatteverket.se/servicelankar/otherlanguages/englishengelska/individualsandemployees/declaringtaxesforindividuals/howtofileyourtaxreturn/incometaxreturn12025.4.5c281c7015abecc2e20911b.html

## Spain

- Agencia Tributaria — Fiscal residence overview: https://sede.agenciatributaria.gob.es/Sede/no-residentes/residencia-personas-fisicas-juridicas.html
- Agencia Tributaria — Individual resident in Spain: https://sede.agenciatributaria.gob.es/Sede/en_gb/no-residentes/residencia-personas-fisicas-juridicas/persona-fisica-residente-espana.html
- Agencia Tributaria — Modelo 720: https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GI34.shtml
- Agencia Tributaria — Modelo 721: https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GI55.shtml
- Agencia Tributaria — Modelo 721 FAQ: https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/declaraciones-informativas/modelo-721-decla-sobre-monedas-extranjero/preguntas-frecuentes-sobre-modelo-721.html

## Exchange rates

- European Central Bank — exchange rates: https://data.ecb.europa.eu/key-figures/ecb-interest-rates-and-exchange-rates/exchange-rates

A tax rule pack may require another official or accepted rate convention. Store the selected policy and exact applied rate.

## Privacy and security

- EUR-Lex — GDPR, including Article 25 data protection by design/default: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- OWASP — Application Security Verification Standard: https://owasp.org/www-project-application-security-verification-standard/
- OWASP — Artificial Intelligence Security Verification Standard: https://owasp.org/www-project-artificial-intelligence-security-verification-standard-aisvs-docs/
