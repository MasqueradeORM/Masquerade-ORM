# SQL Client Differences
- major differences in the find (postgres gives back a nested object, while sqlite is flat and manually nested)
- slight differences in the save
- slight differences in type mapping

anything internal (proxies and their state management data structures) is agnostic to sql clients.

