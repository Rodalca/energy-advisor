# Energy Advisor - versão ajustada

Alterações realizadas:

- `login.html` carrega Supabase antes de usar `createClient`.
- Login consulta a tabela `usuarios` no Supabase.
- Nome do usuário logado aparece no cabeçalho.
- Empresa do usuário aparece abaixo do nome, quando já cadastrada.
- Botão Login aparece apenas sem login.
- Botão Sair aparece apenas após login.
- Se já existir empresa vinculada ao usuário, a página abre direto na análise.
- Se não existir empresa, abre no cadastro de empresa.

Para testar:

1. Abra pelo Live Server.
2. Cadastre um usuário na tabela `usuarios` com `nome`, `email` e `senha`.
3. Faça login com esse e-mail e senha.
4. Cadastre empresa.
5. Faça análise da fatura.
