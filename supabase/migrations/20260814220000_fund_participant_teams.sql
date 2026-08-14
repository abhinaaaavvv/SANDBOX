-- Fund participant-linked teams in the active competition run
--
-- Problem: participant profiles are linked to teams (via team_members) that
-- have no initial_capital entry in the active competition run. This causes
-- checkTeamParticipation() to fail with TEAM_NOT_IN_RUN, blocking all
-- participants from accessing the console after login.
--
-- Fix: insert initial_capital rows for the 4 participant-linked teams
-- in the active run (d1d8bcaf), matching the existing funded teams'
-- initial capital of ₹10,000 (1,000,000 paise).

INSERT INTO public.cash_ledger (team_id, competition_run_id, entry_type, amount_paise, description, created_by, created_at)
VALUES
  -- Demo Team Alpha (Team Alpha captain + Team Beta member)
  ('54a71903-2a98-4872-a592-797c838174f3', 'd1d8bcaf-d8e3-4b75-902b-e9ee981d9796', 'initial_capital', 1000000, 'Initial capital', '479b2b61-2c1c-43ce-8992-949660911327', now()),
  -- SANDBOX Test — Alpha (Test Alpha 1 + Test Alpha 2)
  ('4af2d7f5-eed8-4068-8bb5-8b363dcfe712', 'd1d8bcaf-d8e3-4b75-902b-e9ee981d9796', 'initial_capital', 1000000, 'Initial capital', '479b2b61-2c1c-43ce-8992-949660911327', now()),
  -- SANDBOX Test — Beta (Test Beta 1 + Test Beta 2)
  ('d62a2acc-abf0-4347-baa4-f8464a061c82', 'd1d8bcaf-d8e3-4b75-902b-e9ee981d9796', 'initial_capital', 1000000, 'Initial capital', '479b2b61-2c1c-43ce-8992-949660911327', now()),
  -- SANDBOX Test — Gamma (Test Gamma 1)
  ('b056329e-5507-43cf-8e3f-352751988718', 'd1d8bcaf-d8e3-4b75-902b-e9ee981d9796', 'initial_capital', 1000000, 'Initial capital', '479b2b61-2c1c-43ce-8992-949660911327', now())
ON CONFLICT DO NOTHING;
