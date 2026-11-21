-- Pilot job categories and skills. Tier follows SRS section 7: anything involving
-- household access, children, or private spaces is 'vip' until safeguarding is confirmed.

insert into job_categories (slug, name, tier) values
  ('errands', 'Errands', 'ordinary'),
  ('event-support', 'Event support', 'ordinary'),
  ('shop-help', 'Shop help', 'ordinary'),
  ('delivery', 'Delivery', 'ordinary'),
  ('shop-cleaning', 'Shop / office cleaning', 'ordinary'),
  ('plumbing', 'Plumbing', 'skilled'),
  ('electrical', 'Electrical work', 'skilled'),
  ('repair', 'Repair', 'skilled'),
  ('tutoring', 'Tutoring', 'skilled'),
  ('photography', 'Photography', 'skilled'),
  ('design', 'Design', 'skilled'),
  ('household-cleaning', 'Household cleaning', 'vip'),
  ('household-help', 'Household help', 'vip'),
  ('childcare', 'Childcare', 'vip'),
  ('school-pickup', 'School pickup', 'vip');

insert into skills (slug, name, category_id)
select s.slug, s.name, c.id
from (values
  ('plumbing', 'Plumbing', 'plumbing'),
  ('electrical', 'Electrical wiring', 'electrical'),
  ('phone-repair', 'Phone repair', 'repair'),
  ('furniture-repair', 'Furniture repair', 'repair'),
  ('math-tutoring', 'Mathematics tutoring', 'tutoring'),
  ('english-tutoring', 'English tutoring', 'tutoring'),
  ('photography', 'Photography', 'photography'),
  ('graphic-design', 'Graphic design', 'design'),
  ('cooking', 'Cooking / catering', 'event-support'),
  ('driving', 'Driving (licensed)', 'delivery')
) as s (slug, name, category_slug)
join job_categories c on c.slug = s.category_slug;
