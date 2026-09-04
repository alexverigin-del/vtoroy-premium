-- Disposable PostgreSQL contract fixture only. Never run against a project database.
CREATE TABLE store_locations(id uuid PRIMARY KEY,city text);
CREATE TABLE directus_roles(id uuid PRIMARY KEY,parent uuid);
CREATE TABLE directus_users(id uuid PRIMARY KEY,role uuid,status text,first_name text,last_name text);
CREATE TABLE directus_collections(collection text PRIMARY KEY,icon text,note text,hidden boolean,singleton boolean,accountability text);
CREATE TABLE leads(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'new',assigned_to uuid,kind text,device text,reference_code text,
 store_location_id uuid,is_test boolean NOT NULL DEFAULT false
);
CREATE TABLE lead_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead uuid,created_by uuid,outcome text,comment text);
