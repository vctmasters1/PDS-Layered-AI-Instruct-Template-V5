# Scalability & Token Management Notes

## Why Focused Agents Are Better
- Smaller context windows per agent = dramatically lower tokens and errors
- Gateway: ~800-1.5k tokens
- Domain Supervisor: ~3-5k tokens
- Each Worker: 3-8k tokens

Benefits:
- Can use cheaper models for narrow tasks
- Better quality and predictability
- Easy horizontal scaling
- Strong fault isolation