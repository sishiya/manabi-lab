# usage: perl _dev/tools/rep.pl target pairs.txt   — 置きかえ表（"@@@" 区切り、各ブロックは OLD / "%%%" / NEW）を順に当てる。
# OLD はそのままの文字列で、ちょうど1回だけ出てくること。違えば何も書かずに止まる。
use strict; use warnings;
my ($target, $pairs) = @ARGV;
local $/; open my $fh, '<:raw', $target or die "open $target"; my $s = <$fh>; close $fh;
open my $ph, '<:raw', $pairs or die "open $pairs"; my $p = <$ph>; close $ph;
$p =~ s/\r\n/\n/g;
my @blocks = split /\n\@\@\@\n/, $p; my $n = 0; my $bad = 0;
for my $b (@blocks) {
  next if $b =~ /^\s*$/;
  my ($old, $new) = split /\n%%%\n/, $b, 2;
  die "block without %%%: " . substr($b, 0, 80) unless defined $new;
  $old =~ s/^\n+//; $new =~ s/\n+$//; $old =~ s/\n+$//;
  my $c = () = $s =~ /\Q$old\E/g;
  if ($c != 1) { print "COUNT $c: " . substr($old, 0, 100) . "\n"; $bad++; next; }
  my $i = index($s, $old); substr($s, $i, length($old)) = $new; $n++;
}
if ($bad) { print "NOT WRITTEN ($bad bad, $n ok)\n"; exit 1; }
open my $oh, '>:raw', $target or die; print $oh $s; close $oh; print "OK $n replacements\n";
