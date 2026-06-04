# Scalability & Token Management Notes

Key Principle: Smaller focused agents = dramatically lower tokens and better quality.

Benefits:
- Each agent sees 5-10x less context
- Can use cheaper models for narrow tasks
- Better parallelism
- Easier debugging
- Rule isolation per state/district/school

Challenges:
- More handoffs = orchestration overhead
- Need good state management
- Monitoring across agents