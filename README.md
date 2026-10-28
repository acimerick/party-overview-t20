# Party Overview - Tormenta20 v0.5.0

Correção estrutural da integração com o botão do ActorDirectory.

- A integração `renderActorDirectory` é independente do código da janela.
- `party-overview.js` não é mais importado durante o carregamento do módulo.
- A aplicação é carregada somente ao clicar no botão.
- Se a janela tiver algum erro, o botão continua sendo renderizado e o erro é informado no console.
- A integração do botão permanece baseada no código comprovadamente funcional da v0.4.2.

## Instalação pelo Foundry

Em *Configuração > Módulos > Instalar Módulo*, cole no campo **URL do Manifesto**:

```
https://github.com/Acimerick/party-overview-t20/releases/latest/download/module.json
```

## Licença

[MIT](LICENSE) © Acimerick
