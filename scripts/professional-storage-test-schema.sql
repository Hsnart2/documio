-- Supplemental storage catalog for PostgreSQL CI ONLY (not a production migration).
create schema if not exists storage;
create table storage.buckets(
 id text primary key,name text not null,public boolean not null,
 file_size_limit bigint,allowed_mime_types text[]
);
