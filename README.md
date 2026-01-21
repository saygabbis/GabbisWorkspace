# Gabbis Workspace Discord Bot

Bot de proteção para Discord que desconecta automaticamente bots de som quando um usuário protegido entra em um canal de voz.

## 🚀 Funcionalidades

- **Proteção de voz**: Desconecta automaticamente bots de som quando um usuário protegido entra em um canal
- **Janela de proteção**: Configurável (padrão: 2000ms)
- **Persistência**: Configurações salvas em arquivo JSON
- **Comandos slash**: Interface fácil de usar

## 📋 Pré-requisitos

- Node.js v18 ou superior
- npm ou yarn
- Token do bot Discord
- Client ID do bot Discord

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone <seu-repositorio>
cd GabbisWorkspace
```

2. Instale as dependências:
```bash
npm install
```

3. Crie um arquivo `.env` na raiz do projeto:
```env
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=seu_client_id_aqui
```

4. Deploy dos comandos slash:
```bash
npm run deploy
```

5. Inicie o bot:
```bash
npm start
```

## 📝 Comandos

### `/protect add`
Adiciona uma proteção para um usuário.
- `target`: Usuário que será protegido
- `trigger`: Bot/usuário que será desconectado

### `/protect remove`
Remove uma proteção existente.
- `target`: Usuário protegido
- `trigger`: Bot/usuário que será removido da proteção

### `/protect list`
Lista todas as proteções ativas no servidor.

## 🖥️ Executando no VPS (Linux)

### Usando PM2 (Recomendado)

1. Instale o PM2 globalmente:
```bash
npm install -g pm2
```

2. Inicie o bot com PM2:
```bash
pm2 start src/index.js --name gabbis-bot
```

3. Salve a configuração do PM2:
```bash
pm2 save
pm2 startup
```

4. Comandos úteis do PM2:
```bash
pm2 logs gabbis-bot      # Ver logs
pm2 restart gabbis-bot   # Reiniciar
pm2 stop gabbis-bot      # Parar
pm2 status               # Status
```

### Usando systemd (Alternativa)

Crie um arquivo `/etc/systemd/system/gabbis-bot.service`:

```ini
[Unit]
Description=Gabbis Workspace Discord Bot
After=network.target

[Service]
Type=simple
User=seu_usuario
WorkingDirectory=/caminho/para/GabbisWorkspace
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Depois:
```bash
sudo systemctl enable gabbis-bot
sudo systemctl start gabbis-bot
sudo systemctl status gabbis-bot
```

## 📁 Estrutura do Projeto

```
GabbisWorkspace/
├── data/
│   └── guildConfigs.json    # Configurações salvas (gerado automaticamente)
├── src/
│   ├── commands/            # Comandos slash
│   ├── events/              # Eventos do Discord
│   ├── state/               # Gerenciamento de estado
│   ├── config/              # Configurações
│   ├── client.js            # Cliente Discord
│   ├── index.js             # Entrada principal
│   └── deployCommands.js    # Deploy de comandos
├── .env                     # Variáveis de ambiente (não commitado)
├── .gitignore
└── package.json
```

## 🔒 Segurança

- Nunca commite o arquivo `.env` no Git
- Mantenha seu token seguro
- O diretório `data/` está no `.gitignore` por padrão

## 🐛 Troubleshooting

**Bot não responde aos comandos:**
- Verifique se executou `npm run deploy`
- Confirme que o bot tem permissões no servidor

**Erro ao conectar:**
- Verifique o token no `.env`
- Confirme que o bot está online no Discord Developer Portal

**Proteção não funciona:**
- Verifique se o bot tem permissão para desconectar membros
- Confirme que as proteções foram criadas com `/protect list`

## 📄 Licença

ISC

