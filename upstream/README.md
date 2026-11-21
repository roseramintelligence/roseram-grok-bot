# Roseram with LibreChat

Install [LibreChat](https://www.librechat.ai/docs/local). Merge [librechat.yaml](librechat.yaml) into its configuration and restart the LibreChat service. Select the Roseram endpoint and enter your Roseram developer key in LibreChat's key dialog. Each user supplies their own key. Keep the base URL fixed to Roseram when deploying this configuration.

Use the `roseram` model for a first conversation. This integration uses LibreChat's own account and conversation storage. The Roseram developer key identifies the Roseram account for model requests. It does not enable Roseram single sign-on.

Upstream source and license: [LibreChat, MIT](https://github.com/LibreChat-AI/LibreChat).
