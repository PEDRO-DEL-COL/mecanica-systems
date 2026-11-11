# Mecanica Systems

Sistema de gestão para oficinas mecânicas, em desenvolvimento. Roda no navegador como PWA, funciona offline e guarda os dados no computador do cliente (local-first, SQLite no navegador).

**Status:** fase 0 (fundação) implementada. Veja [docs/PROJETO.md](docs/PROJETO.md).

## Requisitos
- Windows com Google Chrome ou Microsoft Edge atualizado (OPFS e Web Locks). Safari não é suportado.
- Node.js e npm para desenvolvimento.

## Como rodar
```
npm install
npm run dev       # servidor de desenvolvimento
npm run build     # build de produção em dist/
npm test          # testes unitários (Vitest)
npm run e2e       # testes E2E (Playwright; faz build e preview na porta 4173)
```
Para o E2E use Chrome/Edge instalados ou rode `npx playwright install chromium`.

## Aviso sobre backup
Os dados ficam só no navegador deste computador. Limpar dados do navegador, trocar de PC ou perfil os apaga. Exporte backups com regularidade. Importar um backup substitui todos os dados atuais (o app baixa antes um backup automático do banco atual).

## Licença
Copyright (c) 2026 Pedro. Todos os direitos reservados. Código publicado apenas para visualização/portfólio; não é permitido copiar, modificar ou reutilizar. Veja [LICENSE](LICENSE).
