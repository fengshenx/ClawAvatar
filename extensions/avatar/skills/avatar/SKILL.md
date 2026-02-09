---
name: avatar
description: Use the avatar_express tool to add concise emotional/body-language cues when it improves user understanding.
metadata:
  {
    "openclaw": {
      "emoji": "🎭"
    }
  }
---

# Avatar Expression Skill

Use `avatar_express` as a lightweight non-verbal layer.

When to use:

- Celebration after meaningful success.
- Empathy or apology for user frustration.
- Gentle emphasis for warnings or critical reminders.
- Brief acknowledgment when waiting on long operations.

When not to use:

- Every sentence or turn.
- Replacing important textual information.
- Repeated retries if avatar is unavailable.

Pattern:

1. Keep the textual response clear and complete.
2. Add one concise `avatar_express` call when it adds value.
3. If tool returns `accepted=false`, continue normally without retry loops.
