# Claude Code PreToolUse guard (RULES 10, memory: secret-files).
# Blocks: (1) git push  (the user pushes), (2) any tool call that names the YouTube secret folder
# or the secret files. The folder is read at run time from _dev/tools/youtube-upload.local.txt
# (not in Git), so its location is never written in this repository.
# Exit 2 = block (the message on stderr goes back to Claude). Exit 0 = allow.
use strict;
use warnings;
use JSON::PP;

local $/;
my $raw = <STDIN>;
my $in = eval { decode_json($raw) } || {};
my $tool = $in->{tool_name} // '';
my $ti = $in->{tool_input} // {};

# only the fields that point at something (not file contents)
my @fields = grep { defined } map { $ti->{$_} } qw(command file_path path pattern glob notebook_path);
my $text = join("\n", @fields);
(my $norm = lc $text) =~ s#\\+#/#g;

sub block { print STDERR "guard: $_[0]\n"; exit 2; }

# (1) git push
if ($tool =~ /^(Bash|PowerShell)$/) {
  if ($norm =~ /(^|[\s;&|(`])git(\.exe)?\s+(-c\s+\S+\s+|--?[a-z-]+(=\S+)?\s+)*push(\s|$)/) {
    block('git push is done by the user (GitHub Desktop "Push origin"). Commit only and tell the user.');
  }
}

# (2) the secret folder and files
my @needles = ('client_secret', 'youtube-token', 'ga-token');
my $root = $in->{cwd} // '.';
for my $f ("$root/_dev/tools/youtube-upload.local.txt", '_dev/tools/youtube-upload.local.txt') {
  next unless -f $f;
  open(my $h, '<', $f) or next;
  my $line = <$h>; close $h;
  next unless defined $line;
  $line =~ s/^\x{FEFF}|^\xEF\xBB\xBF//;
  my ($first) = split /\r?\n/, $line;
  next unless defined $first && length $first;
  (my $leaf = lc $first) =~ s#\\+#/#g;
  $leaf =~ s#/+$##;
  $leaf =~ s#.*/##;
  push @needles, $leaf if length $leaf >= 4;
  last;
}
for my $n (@needles) {
  if (index($norm, $n) >= 0) {
    block("this names the YouTube secret folder/files. Never read or print them; only _dev/tools/youtube-upload.ps1 may use them.");
  }
}
exit 0;
