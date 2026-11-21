-- Backfill approximate lat/lng from Jimma neighborhood centers (for radius search).
update jobs set lat = 7.690000, lng = 36.820000 where area = 'Kochi' and lat is null;
update jobs set lat = 7.678000, lng = 36.840000 where area = 'Merkato' and lat is null;
update jobs set lat = 7.660000, lng = 36.850000 where area = 'Bosa Kitto' and lat is null;
update jobs set lat = 7.680000, lng = 36.860000 where area = 'JU Campus' and lat is null;
update jobs set lat = 7.670000, lng = 36.825000 where area = 'Hermata' and lat is null;
update jobs set lat = 7.665000, lng = 36.815000 where area = 'Awetu' and lat is null;
update jobs set lat = 7.655000, lng = 36.830000 where area = 'Ginjo' and lat is null;
