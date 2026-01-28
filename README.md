# 🛡️ Gabbis Workspace Discord Bot

Bot multifuncional para Discord com sistema avançado de proteção de voz, blacklist e narração de texto (TTS).

## ✨ Funcionalidades Principais

### 🔒 Sistema de Proteção Anti-Violação
- **Proteção específica**: Protege apenas o target específico do trigger específico
- **Janela de proteção configurável**: Padrão de 2 segundos (customizável)
- **Modos de proteção**: 
  - **Instant**: Proteção com janela de tempo (cooldown configurável)
  - **Persistent**: Proteção contínua enquanto target estiver no canal
- **Rate limiting inteligente**: Cooldown progressivo para tentativas repetidas
- **Detecção de interferência**: Identifica e protege contra bots que tentam desconectar nosso bot
- **Recuperação automática**: Reconecta e retoma proteções após desconexões inesperadas
- **Verificação contínua**: Monitoramento otimizado (100ms para Instant, 2s para Persistent)
- **Validação de integridade**: Verifica permissões, estado e validade das proteções

### 🚫 Sistema de Blacklist
- **Blacklist completa**: Bloqueia usuários completamente do bot
- **Blacklist por comandos**: Bloqueia comandos específicos para usuários
- **Proteção de owners**: Owners configurados não são afetados pela blacklist
- **Lista formatada**: Visualização clara de usuários e comandos bloqueados

### 🎙️ Narração de Texto (TTS)
- **Múltiplos idiomas**: Suporte a 9 idiomas diferentes
- **Configuração por usuário**: Cada usuário pode escolher seu idioma preferido
- **Limite de caracteres**: Máximo de 500 caracteres por mensagem
- **Opcional**: Falar (ou não) o nome de quem enviou a mensagem antes do texto narrado

### 📊 Estatísticas e Logs
- **Estatísticas detalhadas**: Acompanhe ativações e desconexões
- **Sistema de logs**: Canal configurável para logs de comandos e/ou eventos de proteção
- **Logs de segurança**: Registro de tentativas de bypass e interferência (protection)

### 🎵 Soundboard por Servidor
- **Soundboard por guild**: Lista de sons separada por servidor
- **Adicionar por arquivo ou link**: Upload (attachment) ou URL
- **Processamento automático**: Normalização/recorte por duração máxima
- **Controles**: Listagem paginada com botões e reprodução rápida
- **Configurações por servidor**: Duração máxima e volume

## 📋 Pré-requisitos

- **Node.js** v18 ou superior
- **npm** ou **yarn**
- **Token do bot Discord**
- **Client ID do bot Discord**

## 📦 Dependências Principais

- **discord.js** ^14.25.1 - Biblioteca principal do Discord
- **@discordjs/voice** ^0.19.0 - Sistema de voz do Discord
- **@snazzah/davey** ^0.1.9 - Utilitários auxiliares de áudio/voz
- **google-tts-api** ^2.0.2 - Geração de Text-to-Speech
- **opusscript** ^0.0.8 - Codec de áudio Opus
- **ffmpeg-static** ^5.3.0 - FFmpeg para processamento de áudio
- **dotenv** ^17.2.3 - Gerenciamento de variáveis de ambiente

## 🔧 Instalação

1. **Clone o repositório:**
```bash
git clone <seu-repositorio>
cd GabbisWorkspace
```

2. **Instale as dependências:**
```bash
npm install
```

3. **Crie um arquivo `.env` na raiz do projeto:**
```env
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=seu_client_id_aqui
OWNER_IDS=seu_id_discord,outro_id_opcional
```

> **Nota**: `OWNER_IDS` é opcional. Suporta múltiplos IDs separados por vírgula. Owners não são afetados pela blacklist.

4. **Deploy dos comandos slash:**
```bash
npm run deploy
```

5. **Inicie o bot:**
```bash
npm start
```

## 📝 Comandos

### 🔒 Sistema de Proteção (`/protect`)
**⚠️ Requer permissão de Administrador**

#### `/protect add`
Adiciona uma proteção para um usuário.
- `target` (obrigatório): Usuário que será protegido
- `trigger` (obrigatório): Bot/usuário que será desconectado
- `modo` (opcional): Modo de proteção
  - `instant` (padrão): Proteção com janela de tempo
  - `persistent`: Proteção contínua
- `cooldown` (opcional): Janela de proteção em segundos (1-10, padrão: 2, apenas para modo Instant)

**Notas:**
- No modo `persistent`, o `cooldown` é ignorado (bloqueio contínuo enquanto o target estiver na call).

**Exemplo:**
```
/protect add target:@Amiga trigger:@BotSom modo:instant cooldown:3
```

#### `/protect remove`
Remove uma proteção existente.
- `target` (obrigatório): Usuário protegido
- `trigger` (obrigatório): Bot/usuário que será removido da proteção
- `modo` (opcional): Modo específico a remover (se não especificado, remove todos)

#### `/protect edit`
Edita uma proteção existente.
- `target` (obrigatório): Usuário protegido
- `trigger` (obrigatório): Bot/usuário da proteção
- `modo-atual` (opcional): Modo atual da proteção a editar
- `modo` (opcional): Novo modo de proteção
- `cooldown` (opcional): Novo cooldown em segundos

#### `/protect list`
Lista todas as proteções do servidor (com paginação).
- `target` (opcional): Filtrar por usuário protegido
- `trigger` (opcional): Filtrar por usuário que dispara a proteção
- `modo` (opcional): Filtrar por modo (`instant`/`persistent`)

#### `/protect stats`
Mostra estatísticas detalhadas das proteções do servidor, incluindo top 5 proteções mais ativadas.

---

### 🚫 Sistema de Blacklist (`/blacklist`)
**⚠️ Requer permissão de Administrador**

#### `/blacklist add`
Adiciona usuário ou comandos à blacklist.
- `user` (opcional): Usuário a ser bloqueado completamente
- `commands` (opcional): Comandos a bloquear (separados por vírgula, ex: `narrador,protect`)

**Nota**: Pelo menos uma opção deve ser fornecida. Se `commands` for fornecido, `user` é obrigatório.

**Exemplos:**
```
/blacklist add user:@UsuarioRuim
/blacklist add user:@UsuarioRuim commands:narrador,protect
```

#### `/blacklist remove`
Remove usuário ou comandos da blacklist.
- `user` (opcional): Usuário a ser removido da blacklist completa
- `commands` (opcional): Comandos a desbloquear (separados por vírgula)

**Nota**: Pelo menos uma opção deve ser fornecida.

#### `/blacklist list`
Lista todos os usuários e comandos bloqueados no servidor, formatado de forma clara.

#### `/blacklist check`
Verifica se um usuário e/ou comando está bloqueado.
- `user` (opcional): Usuário a verificar
- `command` (opcional): Comando a verificar

**Notas:**
- Você pode passar só `user`, só `command`, ou ambos.
- Para bloquear comandos, o bot valida se o comando existe (baseado nos comandos disponíveis em `src/commands/`).

**Proteções:**
- Owners configurados no `.env` não podem ser bloqueados
- O próprio bot não pode ser bloqueado
- Apenas comandos válidos podem ser bloqueados

---

### 🎙️ Comandos de Narração (`/narrador`)
**✅ Disponível para todos os usuários (exceto blacklist)**

#### `/narrador language`
Define o idioma de narração do usuário.
- `idioma` (obrigatório): Idioma para narração

**Idiomas disponíveis:**
- 🇧🇷 Português (Brasil) - `pt-BR`
- 🇺🇸 English (US) - `en-US`
- 🇪🇸 Español - `es-ES`
- 🇫🇷 Français - `fr-FR`
- 🇩🇪 Deutsch - `de-DE`
- 🇮🇹 Italiano - `it-IT`
- 🇯🇵 日本語 - `ja-JP`
- 🇰🇷 한국어 - `ko-KR`
- 🇨🇳 中文 - `zh-CN`

#### `/narrador mensagem`
Narra uma mensagem de texto no canal de voz.
- `texto` (obrigatório): Texto a ser narrado (máximo: 500 caracteres)

**Nota:** O bot precisa estar conectado ao canal de voz (use `/join` primeiro, se necessário).

#### `/narrador toggle`
Ativa/desativa se o narrador fala o nome de quem enviou a mensagem antes do texto.
- `user` (obrigatório): `on` (ativado) / `off` (desativado)

#### `/narrador info`
Mostra as configurações atuais do narrador (seu idioma e se “falar nome” está ativo).

---

### 🎵 Soundboard (`/sound`)
**✅ Disponível para todos os usuários (exceto blacklist)**  
Algumas configurações avançadas exigem **Administrador** ou **Owner do bot**.

#### `/sound add`
Adiciona um som ao soundboard do servidor.
- `nome` (obrigatório): Nome do som (até 50 caracteres)
- `emoji` (obrigatório): Emoji para o som
- `arquivo` (opcional): Attachment de áudio
- `link` (opcional): URL de áudio
- `comprimento` (opcional): Duração máxima a reproduzir (em ms)

**Notas:**
- Você precisa fornecer **`arquivo` OU `link`**.
- Formatos aceitos: MP3, WAV, M4A, FLAC, AAC, OGG, WMA, OPUS, WEBM
- Para usuários comuns, o bot limita automaticamente a duração máxima (ex.: até 15s, respeitando o limite do servidor).

#### `/sound remove`
Remove um som do soundboard.
- `nome` (opcional): Nome do som (autocomplete)
- `numero` (opcional): Número do som na lista (1, 2, 3...)

#### `/sound play`
Reproduz um som do soundboard (o bot entra automaticamente no canal de voz do usuário).
- `nome` (opcional): Nome do som (autocomplete)
- `numero` (opcional): Número do som na lista (1, 2, 3...)

#### `/sound list`
Lista os sons do servidor com paginação e botões para tocar (o botão só responde para quem executou o comando).

#### `/sound stop`
Para a reprodução atual do soundboard.

#### `/sound settings`
Mostra ou ajusta configurações do soundboard.
- `duracao` (opcional): Duração máxima em segundos (**admin/owner**; admins têm limite máximo)
- `volume` (opcional): Volume (1-200; acima de 100% exige **admin/owner**)
- `clear` (opcional): Remove **todos** os áudios do servidor (**admin/owner**, com confirmação)

---

### 🧾 Logs (`/logs`)
**⚠️ Requer Administrador ou Owner do bot**

#### `/logs add`
Configura um canal para logs.
- `channel` (obrigatório): Canal de texto para enviar logs
- `type` (opcional): `commands`, `protection` ou `all` (padrão: `commands`)
- `command` (opcional): Comando específico para logar (somente quando `type=commands`)

#### `/logs remove`
Remove configuração de logs.
- `type` (opcional): `commands`, `protection` ou `all`
- `command` (opcional): Remove log de um comando específico (somente para `type=commands`)

#### `/logs view`
Mostra a configuração atual de logs do servidor.

---

### 🔊 Voz (`/join` e `/leave`)
**✅ Disponível para todos os usuários (exceto blacklist)**

#### `/join`
Faz o bot entrar no canal de voz em que você está.

#### `/leave`
Faz o bot sair do canal de voz atual (se estiver conectado).

## 🛡️ Sistema de Proteção Anti-Violação

### Características Avançadas

#### ⚡ Verificação Imediata
- Verifica se o trigger já está no canal **ANTES** de armar a proteção
- Previne race conditions e bypasses
- Desconecta imediatamente se necessário

#### 🔄 Rate Limiting Progressivo
Sistema inteligente de cooldown que aumenta progressivamente:
- **1ª tentativa**: 5 segundos
- **2ª tentativa**: 10 segundos
- **3ª tentativa**: 30 segundos
- **4ª tentativa**: 1 minuto
- **5ª+ tentativa**: 5 minutos
- **Reset**: Após 5 minutos sem tentativas

#### 🛡️ Detecção de Interferência Externa
- Detecta quando o bot é desconectado por outro bot
- Identifica tentativas de bypass do sistema
- Loga todas as interferências para análise

#### 🔄 Recuperação Automática
- Reconecta automaticamente após desconexões inesperadas
- Retoma todas as proteções ativas
- Verifica integridade antes de retomar

#### ✅ Validação de Integridade
- Verifica permissões do bot antes de cada ação
- Valida se target e trigger ainda existem no servidor
- Verifica se proteções ainda são válidas
- Limpa proteções inválidas automaticamente

#### ⚡ Otimizações de Performance
- Verificações apenas para o par target+trigger específico
- Cache de permissões (30 segundos)
- Intervalos otimizados (100ms para Instant, 2s para Persistent)
- Limpeza automática de dados expirados

---

## 🖥️ Executando no VPS (Linux)

### Usando PM2 (Recomendado)

1. **Instale o PM2 globalmente:**
```bash
npm install -g pm2
```

2. **Inicie o bot com PM2:**
```bash
pm2 start src/index.js --name gabbis-bot
```

3. **Salve a configuração do PM2:**
```bash
pm2 save
pm2 startup
```

4. **Comandos úteis do PM2:**
```bash
pm2 logs gabbis-bot      # Ver logs
pm2 restart gabbis-bot   # Reiniciar
pm2 stop gabbis-bot      # Parar
pm2 status               # Status
pm2 monit                # Monitoramento em tempo real
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
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Depois:
```bash
sudo systemctl enable gabbis-bot
sudo systemctl start gabbis-bot
sudo systemctl status gabbis-bot
```

---

## 📁 Estrutura do Projeto

```
GabbisWorkspace/
├── data/
│   ├── guildConfigs.json    # Configurações de servidores (gerado automaticamente)
│   ├── userConfigs.json     # Configurações de usuários (idiomas TTS)
│   └── blacklist.json       # Sistema de blacklist (gerado automaticamente)
├── src/
│   ├── commands/            # Comandos slash
│   │   ├── blacklist.js     # Sistema de blacklist
│   │   ├── join.js          # Faz o bot entrar no canal de voz
│   │   ├── leave.js         # Faz o bot sair do canal de voz
│   │   ├── logs.js          # Configuração de logs (comandos/proteção)
│   │   ├── narrador.js      # Comando de narração TTS
│   │   ├── protect.js       # Comando de proteção
│   │   └── sound.js         # Soundboard por servidor
│   ├── events/              # Eventos do Discord
│   │   ├── interactionCreate.js  # Handler de comandos
│   │   └── voiceState.js        # Handler de eventos de voz
│   ├── state/               # Gerenciamento de estado
│   │   ├── blacklist.js     # Gerenciamento de blacklist
│   │   ├── guildConfigs.js  # Configurações por servidor
│   │   ├── soundboard.js    # Estado do soundboard por servidor
│   │   ├── userConfigs.js   # Configurações por usuário
│   │   ├── voiceProtection.js # Rate limiting e cooldown
│   │   └── voiceState.js    # Estado de conexões de voz
│   ├── utils/               # Utilitários
│   │   ├── logger.js        # Sistema de logs avançado
│   │   ├── soundboardManager.js # Download/processamento/arquivos do soundboard
│   │   ├── stats.js         # Estatísticas
│   │   ├── tts.js           # Geração de áudio TTS
│   │   └── voiceManager.js  # Gerenciamento de conexões de voz
│   ├── config/              # Configurações
│   │   └── env.js           # Variáveis de ambiente
│   ├── client.js            # Cliente Discord
│   ├── index.js             # Entrada principal
│   └── deployCommands.js    # Deploy de comandos
├── .env                     # Variáveis de ambiente (não commitado)
├── .gitignore
├── package.json
└── README.md
```

---

## 🔒 Segurança e Permissões

### Permissões do Bot
O bot precisa das seguintes permissões no servidor:
- ✅ **Gerenciar Canais** (para comandos de proteção)
- ✅ **Conectar** (para entrar em canais de voz)
- ✅ **Falar** (para reproduzir áudio TTS)
- ✅ **Desconectar Membros** (para desconectar triggers em proteções)
- ✅ **Usar Comandos de Aplicação** (para comandos slash)
- ✅ **Ver Canal / Enviar Mensagens / Incorporar Links** (para enviar embeds de logs no canal configurado)

### Permissões de Comandos
- **`/protect`**: Requer permissão de **Administrador**
- **`/blacklist`**: Requer permissão de **Administrador**
- **`/narrador`**: Disponível para **todos os usuários** (exceto blacklist)
- **`/sound`**: Disponível para **todos os usuários** (exceto blacklist); ajustes avançados em `settings` exigem **Administrador/Owner**
- **`/logs`**: Requer **Administrador** ou **Owner do bot**
- **`/join`** e **`/leave`**: Disponível para **todos os usuários** (exceto blacklist)

### Segurança
- 🔐 Nunca commite o arquivo `.env` no Git
- 🔐 Mantenha seu token seguro
- 🔐 O diretório `data/` está no `.gitignore` por padrão
- 🔐 Owners configurados não são afetados pela blacklist
- 🔐 Sistema de validação de permissões antes de cada ação

---

## 🐛 Troubleshooting

### Bot não responde aos comandos
- ✅ Verifique se executou `npm run deploy`
- ✅ Confirme que o bot tem permissões no servidor
- ✅ Verifique se o bot está online
- ✅ Confirme que os comandos foram registrados corretamente

### Erro ao conectar
- ✅ Verifique o token no `.env`
- ✅ Confirme que o bot está online no Discord Developer Portal
- ✅ Verifique se o token está correto e não expirou

### Proteção não funciona
- ✅ Verifique se o bot tem permissão para desconectar membros
- ✅ Confirme que as proteções foram criadas com `/protect list`
- ✅ Verifique se você tem permissão de administrador
- ✅ Confirme que o target e trigger ainda existem no servidor
- ✅ Verifique os logs para erros de permissão

### Blacklist não funciona
- ✅ Verifique se você tem permissão de administrador
- ✅ Confirme que o usuário não é owner (owners não podem ser bloqueados)
- ✅ Verifique se os comandos especificados existem
- ✅ Use `/blacklist list` para verificar entradas

### Narrador não funciona
- ✅ Certifique-se de estar em um canal de voz antes de usar `/join`
- ✅ Verifique se o bot tem permissão para entrar e falar no canal
- ✅ Se o áudio não toca, verifique se o `opusscript` foi instalado corretamente
- ✅ Textos muito longos são divididos automaticamente
- ✅ Verifique se você não está na blacklist

### Soundboard não funciona
- ✅ Certifique-se de estar em um canal de voz antes de usar `/sound play` ou os botões do `/sound list`
- ✅ Verifique se o bot tem permissão para entrar e falar no canal
- ✅ Se falhar ao adicionar, confirme o formato do áudio (MP3/WAV/M4A/FLAC/AAC/OGG/WMA/OPUS/WEBM)
- ✅ Se o som estiver sendo cortado, veja a duração máxima em `/sound settings`

### Logs não aparecem
- ✅ Configure com `/logs add channel:#seu-canal type:all` (ou `commands`/`protection`)
- ✅ Verifique se o bot tem permissão no canal (Ver Canal, Enviar Mensagens, Incorporar Links)
- ✅ Use `/logs view` para confirmar o canal e o tipo configurados

### Erro ao instalar dependências
- ✅ Se `@discordjs/opus` falhar, não se preocupe - o `opusscript` é instalado automaticamente
- ✅ Certifique-se de ter Node.js v18 ou superior
- ✅ Tente limpar o cache: `npm cache clean --force`

### Proteção sendo bypassada
- ✅ O sistema agora tem verificação imediata antes de armar
- ✅ Rate limiting progressivo previne tentativas repetidas
- ✅ Verifique os logs para tentativas de bypass
- ✅ Confirme que o bot tem permissões adequadas
- ✅ Verifique se há interferência de outros bots

---

## 📊 Estatísticas e Logs

### Estatísticas de Proteção
- Total de proteções ativas
- Total de ativações
- Total de desconexões
- Top 5 proteções mais ativadas
- Última ativação registrada

### Logs Disponíveis
- 🛡️ **Ativação de Proteção**: Quando uma proteção é ativada
- 🟣 **Target Entrou**: Quando um target protegido entra em call
- ⚠️ **Tentativa de Bypass**: Quando alguém tenta burlar o sistema
- 🚨 **Interferência Externa**: Quando o bot é desconectado por outro bot
- ✅ **Recuperação Automática**: Quando o bot reconecta e retoma proteções
- 🚫 **Blacklist**: Quando usuários/comandos são bloqueados
- 🧾 **Comandos**: Execução de comandos slash (quando `type=commands` ou `type=all`)

---

## 🎯 Como Funciona

### Mecânica de Proteção

1. **Target entra no canal** → Sistema verifica se há proteções ativas
2. **Verificação imediata** → Checa se trigger já está no canal (previne race condition)
3. **Armamento da proteção** → Inicia monitoramento contínuo
4. **Trigger tenta entrar** → Sistema desconecta imediatamente
5. **Cooldown aplicado** → Rate limiting progressivo previne tentativas repetidas
6. **Janela expira** → Proteção é limpa automaticamente

### Mecânica de Blacklist

1. **Usuário executa comando** → Sistema verifica blacklist
2. **Verificação de owner** → Owners não são afetados
3. **Verificação completa** → Se usuário está completamente bloqueado
4. **Verificação por comando** → Se comando específico está bloqueado
5. **Ação negada** → Comando é bloqueado com mensagem apropriada

---

## 📄 Licença

ISC
---

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.

---

## 📝 Changelog

### Versão Atual
- ✅ Sistema de blacklist completo
- ✅ Proteção anti-violação avançada
- ✅ Rate limiting progressivo
- ✅ Detecção de interferência externa
- ✅ Recuperação automática
- ✅ Validação de integridade
- ✅ Logging aprimorado
- ✅ Otimizações de performance
- ✅ Sistema de logs por comando e/ou proteção (`/logs`)
- ✅ Soundboard por servidor (`/sound`)
- ✅ Comandos globais de voz (`/join` e `/leave`)

---

**Desenvolvido com ❤️ para proteção e diversão no Discord**

